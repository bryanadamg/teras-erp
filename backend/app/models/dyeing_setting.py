import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class DyeRecipe(Base):
    __tablename__ = "dye_recipes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    color_standard: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    substrate_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    lines: Mapped[List["DyeRecipeLine"]] = relationship("DyeRecipeLine", back_populates="recipe", cascade="all, delete-orphan")


class DyeRecipeLine(Base):
    __tablename__ = "dye_recipe_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipe_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dye_recipes.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("items.id"), index=True)
    qty_per_100kg: Mapped[float] = mapped_column(Numeric(14, 4))
    uom_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("uoms.id"), nullable=True)
    chemical_type: Mapped[str] = mapped_column(String(16), default="OTHER")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    recipe: Mapped["DyeRecipe"] = relationship("DyeRecipe", back_populates="lines")
    item = relationship("Item")
    uom = relationship("UOM")


class DyeingRun(Base):
    __tablename__ = "dyeing_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="CASCADE"), index=True)
    run_number: Mapped[int] = mapped_column(Integer, default=1)
    recipe_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("dye_recipes.id", ondelete="SET NULL"), nullable=True)
    substrate_qty: Mapped[float] = mapped_column(Numeric(14, 4))
    input_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id"), nullable=True)
    output_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id"), nullable=True)
    machine_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    liquor_ratio: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    temperature_c: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    duration_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="PENDING")
    shade_result: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    shade_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    operator_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    work_order = relationship("WorkOrder")
    recipe: Mapped[Optional["DyeRecipe"]] = relationship("DyeRecipe")
    input_batch = relationship("Batch", foreign_keys=[input_batch_id])
    output_batch = relationship("Batch", foreign_keys=[output_batch_id])
    chemicals: Mapped[List["DyeingRunChemical"]] = relationship("DyeingRunChemical", back_populates="run", cascade="all, delete-orphan")


class DyeingRunChemical(Base):
    __tablename__ = "dyeing_run_chemicals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("dyeing_runs.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("items.id"), index=True)
    planned_qty: Mapped[float] = mapped_column(Numeric(14, 4))
    actual_qty: Mapped[float] = mapped_column(Numeric(14, 4))
    uom_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("uoms.id"), nullable=True)

    run: Mapped["DyeingRun"] = relationship("DyeingRun", back_populates="chemicals")
    item = relationship("Item")
    uom = relationship("UOM")


class SettingRun(Base):
    __tablename__ = "setting_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="CASCADE"), index=True)
    run_number: Mapped[int] = mapped_column(Integer, default=1)
    substrate_qty: Mapped[float] = mapped_column(Numeric(14, 4))
    input_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id"), nullable=True)
    output_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("batches.id"), nullable=True)
    machine_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    temperature_c: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    speed_mpm: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    width_cm: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    overfeed_pct: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    actual_width_cm: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    actual_gsm: Mapped[Optional[float]] = mapped_column(Numeric(8, 4), nullable=True)
    actual_shrinkage_pct: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="PENDING")
    operator_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    work_order = relationship("WorkOrder")
    input_batch = relationship("Batch", foreign_keys=[input_batch_id])
    output_batch = relationship("Batch", foreign_keys=[output_batch_id])
