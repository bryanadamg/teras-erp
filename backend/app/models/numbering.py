import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class NumberRange(Base):
    """One counter per document series — the allocation table behind
    `services/numbering_service.py`.

    Every code in the system used to be minted by counting rows and probing for a
    free suffix (`SELECT count(*) … + 1`, then "is it taken?"). That is a
    check-then-insert race: two concurrent creates read the same count and mint the
    same code. Where the column is unique the loser 500s and loses its whole
    transaction (a Production Run's entire MO tree); where it is not — work order
    codes, sample codes — duplicates land silently, which is worse.

    A row here is locked by the allocating UPDATE and released at commit, so
    concurrent allocations on the same series serialize instead of colliding. This
    is the gapless-counter pattern ERPs use for document numbering (SAP number
    ranges, Odoo's `no_gap` sequences); a rolled-back transaction returns its
    number to the range because the increment rolls back with it.
    """

    __tablename__ = "number_ranges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Series identity, e.g. "MO:JC-81-0612-38-NS-GREIGE" or "WO:<mo uuid>". Callers
    # own the naming; keep one series per code prefix so unrelated documents never
    # queue behind each other.
    range_key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # The next number to hand out (not the last one issued).
    next_value: Mapped[int] = mapped_column(BigInteger, default=1)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now()
    )
