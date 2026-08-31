"""Durable buffer behind the live-event bus.

Every `manager.broadcast()` lands here first, gets a monotonic `seq`, and only
then goes onto Redis. Two things fall out of that:

* **Redis outages stop being silent.** A publish that fails leaves the row with
  `published_at IS NULL`, and `relay_unpublished()` drains it when the bus is back.
  Before, the fallback was a local-only broadcast — everyone connected to another
  worker just never heard.
* **A reconnecting client can catch up exactly.** `events_since()` replays what it
  missed instead of the client blind-refetching its whole route.

Everything here is best-effort by design: if the database is unavailable, `record()`
returns None and the caller still publishes. A broken buffer must degrade to the old
fire-and-forget behaviour, never take the live feed down with it.
"""
import logging
from datetime import datetime, timedelta

from sqlalchemy import delete, select, update

from app.core.db_manager import db_manager
from app.models.event_log import EventLogEntry

logger = logging.getLogger(__name__)

# How long a row is kept. This is a delivery buffer: long enough that a client can
# reconnect after a lunch-break laptop lid or a site-wide network blip and still
# resume exactly, short enough that the table stays small on a Pi. Past this, a
# resuming client is told to resync instead.
EVENT_RETENTION = timedelta(hours=6)

# Most events one reconnect may replay. Beyond it, refetching the current route is
# both cheaper and more certain than replaying thousands of individually debounced
# events.
MAX_REPLAY = 500

# Most rows one relay pass republishes, so a long outage drains in steady batches
# rather than one burst that blocks the loop.
RELAY_BATCH = 200


async def record(message: dict) -> int | None:
    """Persist an event and return its seq, or None if it could not be recorded."""
    try:
        async with db_manager.async_session_factory() as session:
            entry = EventLogEntry(
                event_type=str(message.get("type") or ""),
                payload=message,
            )
            session.add(entry)
            await session.commit()
            return entry.seq
    except Exception:
        logger.warning("Could not record live event to the event log", exc_info=True)
        return None


async def mark_published(seqs: list[int]) -> None:
    if not seqs:
        return
    try:
        async with db_manager.async_session_factory() as session:
            await session.execute(
                update(EventLogEntry)
                .where(EventLogEntry.seq.in_(seqs))
                .values(published_at=datetime.utcnow())
            )
            await session.commit()
    except Exception:
        logger.warning("Could not mark live events published", exc_info=True)


async def unpublished(limit: int = RELAY_BATCH) -> list[tuple[int, dict]]:
    """Rows that never made it onto the bus, oldest first.

    Bounded by retention as well as count: an event nobody could have used for six
    hours is not worth delivering late, and republishing it would only confuse a
    client whose cursor has long since moved past it.
    """
    cutoff = datetime.utcnow() - EVENT_RETENTION
    try:
        async with db_manager.async_session_factory() as session:
            rows = (await session.execute(
                select(EventLogEntry.seq, EventLogEntry.payload)
                .where(EventLogEntry.published_at.is_(None))
                .where(EventLogEntry.created_at >= cutoff)
                .order_by(EventLogEntry.seq)
                .limit(limit)
            )).all()
            return [(r[0], r[1]) for r in rows]
    except Exception:
        logger.warning("Could not read unpublished live events", exc_info=True)
        return []


async def events_since(seq: int, limit: int = MAX_REPLAY) -> tuple[list[dict], bool]:
    """Events after `seq`, plus whether the client's gap was too large to replay.

    `truncated` is True when there are more than `limit` waiting, or when `seq` is
    older than anything still retained — in both cases the client is told to resync
    rather than handed a partial catch-up it would mistake for the whole story.
    """
    cutoff = datetime.utcnow() - EVENT_RETENTION
    try:
        async with db_manager.async_session_factory() as session:
            # An oldest-retained row newer than the cursor means rows were pruned
            # between the client's last event and now: the gap is unknowable.
            oldest = (await session.execute(
                select(EventLogEntry.seq).order_by(EventLogEntry.seq).limit(1)
            )).scalar()
            if oldest is not None and oldest > seq + 1:
                return [], True

            rows = (await session.execute(
                select(EventLogEntry.seq, EventLogEntry.payload)
                .where(EventLogEntry.seq > seq)
                .where(EventLogEntry.created_at >= cutoff)
                .order_by(EventLogEntry.seq)
                .limit(limit + 1)
            )).all()
            if len(rows) > limit:
                return [], True
            return [dict(r[1], seq=r[0]) for r in rows], False
    except Exception:
        logger.warning("Could not replay live events", exc_info=True)
        # Fail toward the blunt-but-correct path rather than a silent partial one.
        return [], True


async def prune() -> int:
    """Drop rows past retention. Returns how many went."""
    cutoff = datetime.utcnow() - EVENT_RETENTION
    try:
        async with db_manager.async_session_factory() as session:
            result = await session.execute(
                delete(EventLogEntry).where(EventLogEntry.created_at < cutoff)
            )
            await session.commit()
            return result.rowcount or 0
    except Exception:
        logger.warning("Could not prune the event log", exc_info=True)
        return 0
