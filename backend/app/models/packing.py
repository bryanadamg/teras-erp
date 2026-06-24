import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, ForeignKey, DateTime, Numeric, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class PackingOrder(Base):
    """Outbound packing / dispatch order. Bridges SO READY -> SENT.

    One SO may have several packing orders (partial shipments). Confirming
    dispatch posts finished-goods stock OUT and (when fully shipped) flips the
    SO to SENT. The printable document is a Surat Jalan (delivery note).
    """
    __tablename__ = "packing_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)  # PK-00001
    sales_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_orders.id", ondelete="CASCADE"), index=True
    )
    # Default ship-from warehouse; each line may override.
    source_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(16), default="DRAFT", index=True)  # DRAFT, DISPATCHED, CANCELLED

    # QC / inspection gate (must pass before dispatch)
    qc_passed: Mapped[bool] = mapped_column(Boolean, default=False)
    qc_inspector: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    qc_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Surat Jalan (our delivery note) fields
    delivery_note_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    delivery_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    carrier: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    vehicle_plate: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    driver: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dispatched_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    sales_order = relationship("SalesOrder")
    source_location = relationship("Location")
    created_by = relationship("User")
    lines = relationship("PackingLine", backref="packing_order", cascade="all, delete-orphan")
    packages = relationship("PackingPackage", backref="packing_order", cascade="all, delete-orphan")


class PackingLine(Base):
    __tablename__ = "packing_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    packing_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("packing_orders.id", ondelete="CASCADE"), index=True
    )
    sales_order_line_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_order_lines.id", ondelete="CASCADE"), index=True
    )
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("items.id"), index=True)
    qty_packed: Mapped[float] = mapped_column(Numeric(14, 4), default=0)
    # Per-line ship-from override (falls back to the order's source_location)
    source_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )
    # Lot pick for lot-tracked finished goods
    batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batches.id", ondelete="SET NULL"), nullable=True
    )

    item = relationship("Item")
    sales_order_line = relationship("SalesOrderLine")
    batch = relationship("Batch")

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
    def batch_number(self):
        return self.batch.batch_number if self.batch else None


class PackingPackage(Base):
    """A physical carton / roll within a packing order (the packing list)."""
    __tablename__ = "packing_packages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    packing_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("packing_orders.id", ondelete="CASCADE"), index=True
    )
    package_no: Mapped[int] = mapped_column(Integer, default=1)
    label: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # e.g. Carton / Roll / Bag
    weight_kg: Mapped[Optional[float]] = mapped_column(Numeric(14, 4), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    contents = relationship("PackingPackageItem", backref="package", cascade="all, delete-orphan")


class PackingPackageItem(Base):
    """What sits inside a carton: an item qty drawn from a packing line."""
    __tablename__ = "packing_package_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    package_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("packing_packages.id", ondelete="CASCADE"), index=True
    )
    packing_line_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("packing_lines.id", ondelete="CASCADE"), index=True
    )
    qty: Mapped[float] = mapped_column(Numeric(14, 4), default=0)

    packing_line = relationship("PackingLine")
