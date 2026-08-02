import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, ForeignKey, DateTime, Numeric, Integer, Table, Column
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


# Association table for PackingOrder <-> AttributeValue (the FG variant being packed)
packing_order_values = Table(
    "packing_order_values",
    Base.metadata,
    Column("packing_order_id", UUID(as_uuid=True), ForeignKey("packing_orders.id", ondelete="CASCADE"), primary_key=True),
    Column("attribute_value_id", UUID(as_uuid=True), ForeignKey("attribute_values.id"), primary_key=True),
)


class PackingOrder(Base):
    """An order to pack finished goods into packaging — WO-shaped, not a delivery doc.

    Consumes bulk FG (and free-entry packaging materials) at `source_location_id`
    and produces PackedUnit cartons — `Batch` rows carrying `packing_order_id`,
    the same way warp beams are Batch rows carrying `source_wo_id` — which land
    as stock at `output_location_id` under their own `batch_key`.

    `sales_order_id` is nullable and only a *tag*: packing runs to stock as well
    as to order, and cartons packed against an SO stay pickable by any pick list
    (soft reservation). The delivery half lives in models/pick_list.py.
    """
    __tablename__ = "packing_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)  # PCK-00001

    # Optional demand link. Null = pack to stock.
    sales_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sales_order_line_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_order_lines.id", ondelete="SET NULL"), nullable=True
    )

    # What is being packed. Variant identity mirrors SO line / MO: attribute values
    # via the association table, shade via color_id — both fold into variant_key.
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("items.id"), index=True)
    color_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("colors.id", ondelete="SET NULL"), nullable=True, index=True
    )

    qty_target: Mapped[float] = mapped_column(Numeric(14, 4), default=0)
    # Default FG qty per carton; the completion form pre-fills from it.
    pack_size: Mapped[Optional[float]] = mapped_column(Numeric(14, 4), nullable=True)
    package_label: Mapped[str] = mapped_column(String(32), default="Carton")

    source_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )
    output_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )

    # PENDING, IN_PROGRESS, COMPLETED, CANCELLED
    status: Mapped[str] = mapped_column(String(16), default="PENDING", index=True)

    target_start_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    target_end_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    actual_start_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    actual_end_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    card_printed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    sales_order = relationship("SalesOrder")
    sales_order_line = relationship("SalesOrderLine")
    item = relationship("Item")
    color = relationship("Color", foreign_keys=[color_id], lazy="joined")
    attribute_values = relationship("AttributeValue", secondary=packing_order_values)
    source_location = relationship("Location", foreign_keys=[source_location_id])
    output_location = relationship("Location", foreign_keys=[output_location_id])
    created_by = relationship("User")
    materials = relationship("PackingOrderMaterial", backref="packing_order", cascade="all, delete-orphan")
    completions = relationship("PackingCompletion", backref="packing_order", cascade="all, delete-orphan")

    @property
    def item_name(self):
        return self.item.name if self.item else None

    @property
    def item_code(self):
        return self.item.code if self.item else None

    @property
    def item_uom(self):
        return self.item.uom if self.item else None

    @property
    def qty_packed(self) -> float:
        """Rolled up from completions rather than stored — one source of truth."""
        return float(sum(float(c.qty or 0) for c in (self.completions or [])))

    @property
    def package_count(self) -> int:
        return int(sum(int(c.package_count or 0) for c in (self.completions or [])))


class PackingOrderMaterial(Base):
    """Planned packaging material for a packing order — free entry, no pack BOM.

    `qty_consumed` is rolled up from the per-completion material rows, so this is
    the plan side only; what actually left stock lives on PackingCompletionMaterial.
    """
    __tablename__ = "packing_order_materials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    packing_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("packing_orders.id", ondelete="CASCADE"), index=True
    )
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("items.id"), index=True)
    qty_planned: Mapped[float] = mapped_column(Numeric(14, 4), default=0)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    item = relationship("Item")

    @property
    def item_name(self):
        return self.item.name if self.item else None

    @property
    def item_code(self):
        return self.item.code if self.item else None

    @property
    def item_uom(self):
        return self.item.uom if self.item else None


class PackingCompletion(Base):
    """One pack-logging event, normally a mobile scan of the packing order QR.

    Each completion consumes `qty` of FG from `source_batch_id` at the order's
    source location and mints `package_count` PackedUnit cartons at the output
    location, pegged back through BatchConsumption (input lot -> carton).
    """
    __tablename__ = "packing_completions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    packing_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("packing_orders.id", ondelete="CASCADE"), index=True
    )
    qty: Mapped[float] = mapped_column(Numeric(14, 4), default=0)
    package_count: Mapped[int] = mapped_column(Integer, default=0)
    # Bulk FG lot consumed (null when the FG item is not lot-tracked).
    source_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batches.id", ondelete="SET NULL"), nullable=True
    )
    operator: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    source_batch = relationship("Batch", foreign_keys=[source_batch_id])
    materials = relationship("PackingCompletionMaterial", backref="completion", cascade="all, delete-orphan")

    @property
    def source_batch_number(self):
        return self.source_batch.batch_number if self.source_batch else None


class PackingCompletionMaterial(Base):
    """Packaging material actually consumed by one completion event."""
    __tablename__ = "packing_completion_materials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    completion_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("packing_completions.id", ondelete="CASCADE"), index=True
    )
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("items.id"), index=True)
    qty: Mapped[float] = mapped_column(Numeric(14, 4), default=0)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )
    batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batches.id", ondelete="SET NULL"), nullable=True
    )

    item = relationship("Item")

    @property
    def item_name(self):
        return self.item.name if self.item else None

    @property
    def item_code(self):
        return self.item.code if self.item else None
