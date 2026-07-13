import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Combo(Base):
    """Combo library master record. A Combo is a yarn-dyed / woven-pattern variant:
    color/pattern is woven in from the start (no piece-dyeing), so each combo carries
    its own BOM. Combo values can run into the hundreds/thousands, so they live here
    in a dedicated searchable master instead of inline under Item Attributes.

    `attribute_value_id` mirrors this combo to a value of the seeded `Combo` variant
    attribute (system_role='combo') 1:1 so the existing SO/sample BOM-gating keeps
    resolving — Combo gates BOM selection *through* that attribute, so unlike the Color
    library (which uses a separate reference attribute) the mirror target here IS the
    variant attribute itself. Never edit/rename the `Combo` attribute directly."""

    __tablename__ = "combos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active", index=True)
    attribute_value_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attribute_values.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    attribute_value = relationship("AttributeValue", foreign_keys=[attribute_value_id])
