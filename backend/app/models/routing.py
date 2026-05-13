import uuid
from typing import Optional
from sqlalchemy import String, Text, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class WorkCenter(Base):
    __tablename__ = "work_centers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cost_per_hour: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    center_type: Mapped[str] = mapped_column(String(16), default="GENERAL")

class Operation(Base):
    __tablename__ = "operations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255)) # e.g. "Cutting"
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
