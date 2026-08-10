import uuid
from datetime import datetime, date
from sqlalchemy import String, ForeignKey, Integer, Text, DateTime, Date, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class LabDipRequest(Base):
    __tablename__ = "lab_dip_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # Which book this request belongs to: 'FG' (finished goods, LD-YYYY-#####) or
    # 'YARN' (raw material, LDY-YYYY-#####). Each draws its own DB sequence, so both
    # number from 1 independently. YARN also prefixes its derived variant codes with
    # 'Y' (Y00003-A) — without that the two books mint identical variant/color codes.
    kind: Mapped[str] = mapped_column(String(8), default="FG", index=True)

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
    # Per-variant progress: PENDING → IN_PROGRESS → APPROVED / REJECTED.
    # APPROVED and REJECTED are terminal: once set, the status is locked.
    status: Mapped[str] = mapped_column(String(32), default="PENDING")
    # Free-text "set" index captured on approval; completes the approved color code
    # (e.g. request seq "00006" + variant "A" + set "5" → "00006-A-5").
    approved_set: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # The Color library shade minted for this variant when it was approved.
    approved_color_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("colors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Captured when a variant is rejected (mirrors the sample-request reject flow).
    rejection_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rejection_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # One proof photo per side, for the CURRENT status only — cleared when a rejected
    # variant is reopened. Per-round copies live on LabDipItemEvent.image_url. Same
    # shape as sample_colors.
    approval_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    rejection_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Overrides the derived variant_code (request seq + letter) when set — carries a
    # rejected item's original code onto its resubmitted (new-request) replacement.
    locked_variant_code: Mapped[str | None] = mapped_column(String(32), nullable=True, default=None)

    item = relationship("Item", foreign_keys=[item_id])
    approved_color = relationship("Color", foreign_keys=[approved_color_id])
    # Read-only grouping of this item's dips. Lines are owned by LabDipRequest.dips
    # (every line always has lab_dip_request_id) to keep a single cascade owner.
    dips = relationship(
        "LabDipLine",
        order_by="LabDipLine.order",
        viewonly=True,
        primaryjoin="LabDipItem.id == LabDipLine.lab_dip_item_id",
    )
    # Full rejection history (one row per reject). Count = times rejected (survives
    # reopen); each row keeps its reason/notes for traceability.
    rejections = relationship(
        "LabDipRejection",
        order_by="LabDipRejection.round_no",
        cascade="all, delete-orphan",
    )


class LabDipRejection(Base):
    __tablename__ = "lab_dip_rejections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lab_dip_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_dip_items.id", ondelete="CASCADE"), index=True
    )
    # 1-based reject sequence for this item (1 = first rejection).
    round_no: Mapped[int] = mapped_column(Integer, default=1)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejected_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    rejected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class LabDipItemEvent(Base):
    """Immutable log of every status transition a lab dip variant went through.

    Same shape and same reason as `sample_color_events`: the item row only carries its
    *current* status, so "how many times did we dip / reject / approve this variant in a
    date range" is unanswerable from it. `lab_dip_rejections` already logs one side of
    that; this logs all four transitions so the Lab Dip Report can count attempts the
    way the Sample Development Report does. Rejections keep their own table — it is the
    reason/notes record of record and is what the variant UI reads.
    """

    __tablename__ = "lab_dip_item_events"
    __table_args__ = (
        # The report groups by (event, created_at range); this is the covering order.
        Index("ix_lab_dip_item_events_event_created", "event", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lab_dip_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_dip_items.id", ondelete="CASCADE"), index=True
    )
    # Denormalised parent so the report can filter by customer/kind without a second
    # join hop through lab_dip_items on every aggregate.
    lab_dip_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_dip_requests.id", ondelete="CASCADE"), index=True
    )
    # The status the variant moved INTO: PENDING | IN_PROGRESS | APPROVED | REJECTED
    event: Mapped[str] = mapped_column(String(32), index=True)
    previous_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 1-based occurrence of this event for this variant (2 = second rejection).
    round_no: Mapped[int] = mapped_column(Integer, default=1)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Photo attached to THIS round's approval/rejection, uploaded right after the
    # transition lands on this row.
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


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
