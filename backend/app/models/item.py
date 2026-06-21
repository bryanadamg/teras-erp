from sqlalchemy import String, Boolean, Float, ForeignKey, Table, Column, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
import uuid
from datetime import datetime
from app.models.category import Category

# Association table for Item <-> Attribute
item_attributes = Table(
    "item_attributes",
    Base.metadata,
    Column("item_id", UUID(as_uuid=True), ForeignKey("items.id"), primary_key=True),
    Column("attribute_id", UUID(as_uuid=True), ForeignKey("attributes.id"), primary_key=True),
)

# Association table for Item <-> UOMFactor (packaging units)
item_uom_factors = Table(
    "item_uom_factors",
    Base.metadata,
    Column("item_id", UUID(as_uuid=True), ForeignKey("items.id", ondelete="CASCADE"), primary_key=True),
    Column("uom_factor_id", UUID(as_uuid=True), ForeignKey("uom_factors.id", ondelete="CASCADE"), primary_key=True),
)

class Item(Base):
    __tablename__ = "items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    uom: Mapped[str] = mapped_column(String(32))
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    category: Mapped["Category | None"] = relationship(
        "Category", foreign_keys="[Item.category_id]", lazy="joined"
    )

    # Lineage: which SampleRequest + SampleColor this item was derived from
    source_sample_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample_requests.id", ondelete="SET NULL"), nullable=True
    )
    source_color_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample_colors.id", ondelete="SET NULL"), nullable=True
    )

    weight_per_unit: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_unit: Mapped[str | None] = mapped_column(String(16), nullable=True)  # e.g. gsm, g/m², oz/yd²
    ends: Mapped[int | None] = mapped_column(nullable=True)  # warp ends count for beam items
    lot_tracked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")  # enforce lot/batch on all stock moves
    min_stock_level: Mapped[float | None] = mapped_column(Float, nullable=True)  # reorder point; null → default low-stock threshold (10)

    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    attributes = relationship("Attribute", secondary=item_attributes, backref="items")
    packaging_factors = relationship("UOMFactor", secondary=item_uom_factors, lazy="selectin")
    source_sample = relationship("SampleRequest", foreign_keys=[source_sample_id])
    source_color = relationship("SampleColor", foreign_keys=[source_color_id])
