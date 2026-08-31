from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List
from fastapi import WebSocket
import asyncio
import json
import os
import logging
from redis import asyncio as aioredis

from app.core.ws_events import can_receive

logger = logging.getLogger(__name__)

# Close code sent when a connection's JWT expires mid-session. Distinct from
# 1008 (token was never valid) so the client can tell "log in again" from
# "your session just aged out" — and stop reconnecting on either.
WS_CLOSE_TOKEN_EXPIRED = 4001


@dataclass
class ConnectionState:
    """Identity of one authenticated socket.

    `perms` is a SNAPSHOT taken at connect, not re-read per event: a broadcast
    fans out to every connection, and a query per connection per event would put
    the permission table on the hot path of every mutation in the system. The
    cost is that a permission change lands on that user's next connect; the
    JWT's own expiry (<=24h, and enforced below) bounds how long that can drift.
    """
    user_id: str
    username: str
    perms: set[str] = field(default_factory=set)
    expires_at: datetime | None = None


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[WebSocket, ConnectionState] = {}
        self.redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        self.redis: aioredis.Redis | None = None
        self.pubsub: aioredis.client.PubSub | None = None
        self._listener_task: asyncio.Task | None = None
        self.channel_name = "terras_events"
        self._invalidation_hooks: List[callable] = []

    def register_invalidation_hook(self, fn: callable):
        """Run fn(message) on every broadcast this instance receives (local or via
        Redis), so a request-scoped in-process cache can drop itself when the data
        it holds changed — without a dedicated pub/sub subscription per cache."""
        self._invalidation_hooks.append(fn)

    async def connect(self, websocket: WebSocket, state: ConnectionState):
        """Join the broadcast pool. The caller MUST have accepted the socket and
        authenticated it first (see the /ws/events endpoint) — this manager has
        no way to identify an anonymous connection, and an unidentified one would
        have to be handed either everything or nothing."""
        self.active_connections[websocket] = state

    def disconnect(self, websocket: WebSocket):
        self.active_connections.pop(websocket, None)

    async def initialize(self):
        """Initializes Redis connection and PubSub listener."""
        try:
            self.redis = aioredis.from_url(self.redis_url, decode_responses=True)
            self.pubsub = self.redis.pubsub()
            await self.pubsub.subscribe(self.channel_name)
            self._listener_task = asyncio.create_task(self._listen_to_redis())
            logger.info(f"WebSocket manager initialized with Redis: {self.redis_url}")
        except Exception as e:
            logger.error(f"Failed to initialize Redis for WebSockets: {e}")

    async def stop(self):
        """Stops the listener and closes Redis."""
        if self._listener_task:
            self._listener_task.cancel()
        if self.pubsub:
            await self.pubsub.unsubscribe(self.channel_name)
            await self.pubsub.close()
        if self.redis:
            await self.redis.close()

    async def _listen_to_redis(self):
        """Internal task to listen for Redis messages and broadcast to local clients."""
        try:
            async for message in self.pubsub.listen():
                if message["type"] == "message":
                    data = json.loads(message["data"])
                    await self._local_broadcast(data)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Redis listener encountered error: {e}")
            await asyncio.sleep(5)
            # Re-initialize on failure
            asyncio.create_task(self.initialize())

    async def _local_broadcast(self, message: dict):
        """Broadcasts to connections on THIS server instance, filtered per user."""
        # Cache invalidation runs first and unconditionally: it is server-side
        # state, so it must not depend on who happens to be connected.
        for fn in self._invalidation_hooks:
            try:
                fn(message)
            except Exception:
                pass

        event_type = message.get("type") or ""
        now = datetime.now(timezone.utc)
        # (connection, close_code|None) — closed after the loop so the dict isn't
        # mutated while iterating.
        drop: list[tuple[WebSocket, int | None]] = []

        for connection, state in list(self.active_connections.items()):
            if state.expires_at and state.expires_at <= now:
                drop.append((connection, WS_CLOSE_TOKEN_EXPIRED))
                continue
            if not can_receive(event_type, state.perms):
                continue
            try:
                await connection.send_json(message)
            except Exception:
                # A send failure means the socket is gone; the receive loop may
                # never see it (a half-open TCP connection reads nothing), so
                # reap it here or it leaks a ConnectionState per dead client.
                drop.append((connection, None))

        for connection, code in drop:
            self.disconnect(connection)
            if code is not None:
                try:
                    await connection.close(code=code)
                except Exception:
                    pass

    async def broadcast(self, message: dict):
        """
        Global broadcast: Publishes to Redis.
        The listener on each instance will pick it up and broadcast locally.
        """
        if self.redis:
            try:
                await self.redis.publish(self.channel_name, json.dumps(message))
            except Exception as e:
                logger.error(f"Failed to publish to Redis: {e}")
                # Fallback to local broadcast if Redis is down
                await self._local_broadcast(message)
        else:
            await self._local_broadcast(message)

manager = ConnectionManager()
