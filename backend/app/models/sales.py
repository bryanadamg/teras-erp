import uuid
from typing import TYPE_CHECKING, Optional
from sqlalchemy import String, ForeignKey, Numeric, DateTime, Text, Table, Column
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from datetime import datetime

if TYPE_CHECKING:
    from app.models.bom import BOMSize

# Association table for SalesOrderLine <-> AttributeValue
sales_order_line_values = Table(
    "sales_order_line_values",
    Base.metadata,
    Column("sales_order_line_id", UUID(as_uuid=True), ForeignKey("sales_order_lines.id"), primary_key=True),
    Column("attribute_value_id", UUID(as_uuid=True), ForeignKey("attribute_values.id"), primary_key=True),
)

class SalesOrder(Base):
    __tablename__ = "sales_orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    po_number: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    customer_po_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    customer_name: Mapped[str] = mapped_column(String(255))
    order_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    status: Mapped[str] = mapped_column(String(32), default="PENDING", index=True) # PENDING, READY, PARTIAL, SENT, DELIVERED, CANCELLED
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    lines = relationship("SalesOrderLine", backref="order", cascade="all, delete-orphan")

class SalesOrderLine(Base):
    __tablename__ = "sales_order_lines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    sales_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_orders.id"), index=True
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id"), index=True
    )
    qty: Mapped[float] = mapped_column(Numeric(14, 4))
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    internal_confirmation_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ket_stock: Mapped[str | None] = mapped_column(String(255), nullable=True)
    qty_kg: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    qty2: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    uom2: Mapped[str | None] = mapped_column(String(32), nullable=True)
    uom2_factor: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    bom_size_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bom_sizes.id", ondelete="SET NULL"), nullable=True
    )
    # Color-type FG variant: the ordered shade from the Color Library. Threads
    # SO -> PR -> MO so the DYEING WO auto-matches the active DyeRecipe by color_id.
    color_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("colors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Pending (not-yet-approved) shade: the ordered color is still in lab dip. The
    # stable identity is the lab dip variant_code (e.g. '00006-A'), preserved across
    # reject->resubmit via LabDipItem.locked_variant_code. On approval the minted
    # Color is auto-backfilled onto the root MO by matching this code. labdip_item_id
    # is the item row at order time (for display/trace; may go stale if rejected).
    labdip_variant_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    labdip_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_dip_items.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    item = relationship("Item")
    attribute_values = relationship("AttributeValue", secondary=sales_order_line_values)
    bom_size = relationship("BOMSize", foreign_keys=[bom_size_id])
    color = relationship("Color", foreign_keys=[color_id])
    labdip_item = relationship("LabDipItem", foreign_keys=[labdip_item_id], lazy="noload")
