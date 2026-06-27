import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Color(Base):
    """Color library master record. Industry-standard shade reference:
    Pantone (communication) + Colour Index (dye classification) + spectro note.
    `attribute_value_id` mirrors this color to a `Color Code` (system_role='labdip_color')
    AttributeValue (1:1) so the legacy LabDip color dropdown keeps resolving during the
    transition (Option A). The variant `Colors` attribute is left untouched."""

    __tablename__ = "colors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    pantone_ref: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    colour_index: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    hex: Mapped[Optional[str]] = mapped_column(String(9), nullable=True)
    substrate: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    customer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partners.id"), nullable=True, index=True
    )
    customer_color_code: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    spectro_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active", index=True)
    attribute_value_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attribute_values.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # PLM lineage: the approved LabDip dip line this shade was spawned from (mirrors
    # Item.source_color_id). Note lab_dip_lines also has color_id -> colors, so the two
    # tables reference each other; both nullable, FKs disambiguated via foreign_keys=.
    source_lab_dip_line_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_dip_lines.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer = relationship("Partner", foreign_keys=[customer_id])
    attribute_value = relationship("AttributeValue", foreign_keys=[attribute_value_id])
    source_lab_dip_line = relationship("LabDipLine", foreign_keys=[source_lab_dip_line_id])
    recipes: Mapped[List["DyeRecipe"]] = relationship("DyeRecipe", back_populates="color")
