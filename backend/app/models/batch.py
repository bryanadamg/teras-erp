import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, ForeignKey, DateTime, Numeric, Integer, JSON, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_number: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    vendor_lot: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("items.id"), index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Beam fields: set when the batch represents a physical warp beam
    ends: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_wo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="SET NULL"), nullable=True
    )
    # Size identity of this produced lot, copied from the source MO at WO-completion
    # (e.g. a sized greige GRG- lot woven for size L). bom_size_id is the joinable
    # FK; bom_size_snapshot is the immutable label ({size_name, label, ...}) so a
    # later BOMSize edit/delete can't corrupt an already-produced physical lot.
    bom_size_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bom_sizes.id", ondelete="SET NULL"), nullable=True
    )
    bom_size_snapshot: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # QC status: GOOD | REJECTED. Rejected lots stay physically in stock but are
    # excluded from netting/availability and from consumption/staging pickers.
    quality_status: Mapped[str] = mapped_column(String(16), default="GOOD", server_default="GOOD")

    item = relationship("Item")
    consumptions_as_input = relationship("BatchConsumption", foreign_keys="BatchConsumption.input_batch_id", back_populates="input_batch")
    consumptions_as_output = relationship("BatchConsumption", foreign_keys="BatchConsumption.output_batch_id", back_populates="output_batch")


class BatchConsumption(Base):
    __tablename__ = "batch_consumptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    manufacturing_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("manufacturing_orders.id", ondelete="CASCADE"), index=True
    )
    input_batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batches.id", ondelete="CASCADE"), index=True
    )
    output_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batches.id", ondelete="SET NULL"), nullable=True, index=True
    )
    qty_consumed: Mapped[float] = mapped_column(Numeric(14, 4))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    input_batch = relationship("Batch", foreign_keys=[input_batch_id], back_populates="consumptions_as_input")
    output_batch = relationship("Batch", foreign_keys=[output_batch_id], back_populates="consumptions_as_output")
