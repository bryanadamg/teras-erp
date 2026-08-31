"""Counters for the live-event bus.

Everything about this subsystem used to be invisible. A publish failure was one
`logger.error` followed by a silent local-only fallback; a client filtered out by
permission or topic looked exactly like a client that got nothing because nothing
happened; a dropped slow consumer left no trace at all. So there was no way to
answer "is the live feed healthy?" other than opening the app and watching.

Plain in-process counters, deliberately: there is no metrics backend in this stack,
one API process serves the plant, and numbers that reset on restart are enough to
answer the questions that actually get asked — is anything connected, is anything
failing to publish, is anyone being dropped, how far behind is delivery. Exposed on
GET /api/health/events. If a metrics backend ever lands, this is the shape to
export from, not a thing to keep alongside it.

No locking: a single event loop owns every one of these increments.
"""
import time
from dataclasses import dataclass, field


@dataclass
class _Summary:
    """count/total/max for a duration, in seconds. Not a histogram — the questions
    here are "is it fast" and "how bad does it get", which a mean and a max answer."""
    count: int = 0
    total: float = 0.0
    max: float = 0.0

    def observe(self, seconds: float) -> None:
        self.count += 1
        self.total += seconds
        if seconds > self.max:
            self.max = seconds

    def as_dict(self) -> dict:
        return {
            "count": self.count,
            "avg_ms": round((self.total / self.count) * 1000, 2) if self.count else None,
            "max_ms": round(self.max * 1000, 2) if self.count else None,
        }


@dataclass
class WsMetrics:
    started_at: float = field(default_factory=time.time)

    # Connections
    connections_opened: int = 0
    connections_rejected: int = 0      # bad/missing token (1008)
    connections_errored: int = 0       # handshake blew up server-side (1011)
    connections_closed: int = 0
    closed_token_expired: int = 0      # 4001
    closed_backpressure: int = 0       # 1013

    # Resume
    resumes_requested: int = 0
    resync_required: int = 0
    events_replayed: int = 0

    # Publishing
    events_published: int = 0
    publish_failures: int = 0
    events_relayed: int = 0
    events_unrecorded: int = 0         # event log write failed; sent without a seq

    # Delivery (per connection, per event)
    deliveries: int = 0
    filtered_permission: int = 0
    filtered_topic: int = 0
    send_errors: int = 0

    # Timings
    broadcast_time: _Summary = field(default_factory=_Summary)   # record + publish
    send_lag: _Summary = field(default_factory=_Summary)         # enqueue -> socket
    max_queue_depth: int = 0

    def note_queue_depth(self, depth: int) -> None:
        if depth > self.max_queue_depth:
            self.max_queue_depth = depth

    def snapshot(self, connections: int) -> dict:
        return {
            "uptime_seconds": round(time.time() - self.started_at, 1),
            "connections": {
                "current": connections,
                "opened": self.connections_opened,
                "closed": self.connections_closed,
                "rejected": self.connections_rejected,
                "errored": self.connections_errored,
                "closed_token_expired": self.closed_token_expired,
                "closed_backpressure": self.closed_backpressure,
            },
            "resume": {
                "requested": self.resumes_requested,
                "resync_required": self.resync_required,
                "events_replayed": self.events_replayed,
            },
            "publish": {
                "published": self.events_published,
                "failures": self.publish_failures,
                "relayed": self.events_relayed,
                "unrecorded": self.events_unrecorded,
                "time": self.broadcast_time.as_dict(),
            },
            "delivery": {
                "delivered": self.deliveries,
                "filtered_permission": self.filtered_permission,
                "filtered_topic": self.filtered_topic,
                "send_errors": self.send_errors,
                "lag": self.send_lag.as_dict(),
                "max_queue_depth": self.max_queue_depth,
            },
        }


metrics = WsMetrics()
