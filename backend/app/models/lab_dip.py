import uuid
from datetime import datetime, date
from sqlalchemy import String, ForeignKey, Integer, Text, DateTime, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class LabDipRequest(Base):
    __tablename__ = "lab_dip_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partners.id"), nullable=True, index=True
    )
    base_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id"), nullable=True, index=True
    )
    approved_recipe_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dye_recipes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    color_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("colors.id", ondelete="SET NULL"), nullable=True, index=True
    )

    request_date: Mapped[date] = mapped_column(Date, default=date.today)
    season: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_article_code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    internal_article_code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    substrate: Mapped[str | None] = mapped_column(String(255), nullable=True)
    color_standard: Mapped[str | None] = mapped_column(String(255), nullable=True)
    request_type: Mapped[str] = mapped_column(String(16), default="NEW")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    estimated_completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(String(32), default="DRAFT", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    customer = relationship("Partner", foreign_keys=[customer_id])
    base_item = relationship("Item", foreign_keys=[base_item_id])
    approved_recipe = relationship("DyeRecipe", foreign_keys=[approved_recipe_id])
    # Finished-good items this request tests colors against; each carries its own dips.
    items = relationship("LabDipItem", order_by="LabDipItem.order", cascade="all, delete-orphan")
    # All dips flat under the request (kept for legacy/ungrouped dips and status lookups).
    dips = relationship("LabDipLine", order_by="LabDipLine.order", cascade="all, delete-orphan")


class LabDipItem(Base):
    __tablename__ = "lab_dip_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lab_dip_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_dip_requests.id", ondelete="CASCADE"), index=True
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id"), index=True
    )
    order: Mapped[int] = mapped_column(Integer, default=0)
    # Stable 0-based index used to derive the item's variant letter (A, B, C…).
    # Assigned once when the item is added; never re-indexed when siblings are removed.
    variant_seq: Mapped[int] = mapped_column(Integer, default=0)

    item = relationship("Item", foreign_keys=[item_id])
    # Read-only grouping of this item's dips. Lines are owned by LabDipRequest.dips
    # (every line always has lab_dip_request_id) to keep a single cascade owner.
    dips = relationship(
        "LabDipLine",
        order_by="LabDipLine.order",
        viewonly=True,
        primaryjoin="LabDipItem.id == LabDipLine.lab_dip_item_id",
    )


class LabDipLine(Base):
    __tablename__ = "lab_dip_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lab_dip_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_dip_requests.id", ondelete="CASCADE"), index=True
    )
    lab_dip_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_dip_items.id", ondelete="CASCADE"), nullable=True, index=True
    )
    color_name: Mapped[str] = mapped_column(String(255))
    color_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("colors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    submission_round: Mapped[int] = mapped_column(Integer, default=1)
    recipe_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="PENDING")
    remarks: Mapped[str | None] = mapped_column(String(512), nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
