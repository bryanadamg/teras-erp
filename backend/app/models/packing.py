import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, ForeignKey, DateTime, Numeric, Integer, Boolean, Table, Column
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

    # --- Alt (selling) unit -------------------------------------------------
    # Snapshotted off the ordered SO line, or picked by hand when packing to
    # stock. `qty_target` stays the canonical figure in the item's own UOM —
    # stock, StockBalance, genealogy and pick lists all move in that — and these
    # only record what the customer counts in (Pic = a roll, Pcs = a cut piece).
    #
    # `uom2_factor` carries the same meaning as `SalesOrderLine.uom2_factor`: the
    # qty of one alt unit as the UOM master states it (1 Pcs = 5 yard -> 5). That
    # unit is usually a length but not always — `1 Box = 10 kg` is a seeded row
    # too — so alt -> base is one hop or two (alt -> length -> kg via the item's
    # g/y or g/m); see `packing_service.base_per_alt`.
    qty2: Mapped[Optional[float]] = mapped_column(Numeric(14, 4), nullable=True)
    uom2: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    uom2_factor: Mapped[Optional[float]] = mapped_column(Numeric(14, 4), nullable=True)
    # Which unit that factor is expressed in ('Yard' / 'm' / 'kg'), resolved off
    # the UOM master once at create time. Stored rather than re-derived: the SO
    # view recovers it by matching the factor VALUE back against the UOM's
    # factor rows and silently falls back to yard when it misses, which turns a
    # metre-based recipe into a 9% error. One column removes that guess.
    uom2_length_uom: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    source_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )
    output_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )

    # The packing machine this order is dispatched to — the WorkCenter MACHINE row,
    # same role `WorkOrder.work_center_id` plays for production. Planned here, and
    # copied onto every completion that does not name its own machine, so a
    # per-machine report never has to read a nullable operator field.
    work_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_centers.id", ondelete="SET NULL"), nullable=True, index=True
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
    work_center = relationship("WorkCenter", foreign_keys=[work_center_id], lazy="joined")
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
    def work_center_name(self):
        return self.work_center.name if self.work_center else None

    @property
    def qty_packed(self) -> float:
        """Rolled up from completions rather than stored — one source of truth.
        QC-rejected logs don't count as packed output (mirrors MO progress)."""
        return float(sum(float(c.qty or 0) for c in (self.completions or []) if not c.rejected))

    @property
    def package_count(self) -> int:
        return int(sum(int(c.package_count or 0) for c in (self.completions or []) if not c.rejected))

    @property
    def qty_rejected(self) -> float:
        """Scrap across ALL completions — a partial reject leaves its log active
        with the rejected cartons' qty moved onto qty_rejected."""
        return float(sum(float(c.qty_rejected or 0) for c in (self.completions or [])))

    @property
    def package_count_rejected(self) -> int:
        return int(sum(int(c.package_count_rejected or 0) for c in (self.completions or [])))


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
    # Machine this event ran on. Defaults to the order's own machine in
    # `add_packing_completion` rather than staying null when the packer does not
    # pick one — the same fix MOCompletion needed after per-machine weaving
    # figures read 0 for every log with a null column.
    work_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_centers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Who packed it. Two fields on purpose, the same split `work_center_id` +
    # `work_center_name` uses: `operator_user_id` is the identity every
    # per-operator figure groups on — always the authenticated user, since
    # operators log in with their own accounts — and `operator` is the display
    # snapshot the packer may override (and the only identity legacy rows have).
    operator_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    operator: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # QC reject — same split as MOCompletion: `rejected` drops the log out of
    # packed progress, `qty_rejected` is the durable scrap record that survives
    # disposal of the carton. A partial reject (some cartons of the event) keeps
    # `rejected` false and moves only the rejected cartons' qty across.
    rejected: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    qty_rejected: Mapped[float] = mapped_column(Numeric(14, 4), default=0, server_default="0")
    package_count_rejected: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    reject_reason: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    rejected_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    rejected_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    reject_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )

    source_batch = relationship("Batch", foreign_keys=[source_batch_id])
    operator_user = relationship("User", foreign_keys=[operator_user_id], lazy="joined")
    work_center = relationship("WorkCenter", foreign_keys=[work_center_id], lazy="joined")
    reject_location = relationship("Location", foreign_keys=[reject_location_id], lazy="joined")
    materials = relationship("PackingCompletionMaterial", backref="completion", cascade="all, delete-orphan")

    @property
    def source_batch_number(self):
        return self.source_batch.batch_number if self.source_batch else None

    @property
    def operator_full_name(self):
        """Account holder's name — falls back to the typed text for legacy logs."""
        return (self.operator_user.full_name if self.operator_user else None) or self.operator

    @property
    def work_center_name(self):
        return self.work_center.name if self.work_center else None


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
