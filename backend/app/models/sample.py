import uuid
from datetime import datetime, date
from sqlalchemy import String, ForeignKey, Integer, Text, DateTime, Table, Column, Boolean, Float, Date, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

# Kept for backward compatibility — not actively used after this change
sample_attribute_values = Table(
    "sample_attribute_values",
    Base.metadata,
    Column("sample_request_id", UUID(as_uuid=True), ForeignKey("sample_requests.id"), primary_key=True),
    Column("attribute_value_id", UUID(as_uuid=True), ForeignKey("attribute_values.id"), primary_key=True),
)


class SampleColor(Base):
    __tablename__ = "sample_colors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sample_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample_requests.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    is_repeat: Mapped[bool] = mapped_column(Boolean, default=False)
    order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="PENDING")
    rejection_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rejection_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Sign-off note captured in the approve dialog (mirrors the reject side, which
    # has carried reason + notes since the reject flow was built).
    approval_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # One proof photo per side, for the CURRENT status only — a reopened variant
    # clears these on the way back to IN_PRODUCTION. Every round's photo survives on
    # its SampleColorEvent row, which is the history of record.
    approval_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    rejection_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Attempt tallies + own timestamps. The parent request's updated_at is bumped by
    # ANY edit to the request, so it cannot date a variant's approval/rejection —
    # the sample development report ranges on these columns and on
    # SampleColorEvent.created_at, never on SampleRequest.updated_at.
    status_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    first_process_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_process_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Denormalised counts of the event rows below (a rejected variant is reopened for
    # another attempt, so both can exceed 1). Kept in sync in update_color_status.
    process_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    reject_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    approve_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    events = relationship(
        "SampleColorEvent",
        order_by="SampleColorEvent.created_at",
        cascade="all, delete-orphan",
        back_populates="color",
    )


class SampleColorEvent(Base):
    """Immutable log of every status transition a sample variant went through.

    The variant row only carries its *current* status, so "how many times did we
    process / reject / approve this variant in a date range" is unanswerable from it.
    Each transition appends one row here; the report counts rows, and the counts
    survive a later reopen (same shape as lab_dip_rejections, but for all events,
    since the client asks for process and approve attempts too).
    """

    __tablename__ = "sample_color_events"
    __table_args__ = (
        # The report groups by (event, created_at range); this is the covering order.
        Index("ix_sample_color_events_event_created", "event", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sample_color_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample_colors.id", ondelete="CASCADE"), index=True
    )
    # Denormalised parent so the report can filter by customer/category without a
    # second join hop through sample_colors on every aggregate.
    sample_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample_requests.id", ondelete="CASCADE"), index=True
    )
    # The status the variant moved INTO: PENDING | IN_PRODUCTION | SENT | APPROVED | REJECTED
    event: Mapped[str] = mapped_column(String(32), index=True)
    previous_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 1-based occurrence of this event for this variant (2 = second rejection).
    round_no: Mapped[int] = mapped_column(Integer, default=1)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Photo attached to THIS round's approval/rejection. Uploaded right after the
    # transition, so it lands on the newest event row for the variant.
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    color = relationship("SampleColor", back_populates="events")
    created_by = relationship("User", foreign_keys=[created_by_id])


class SampleRequest(Base):
    __tablename__ = "sample_requests"
    # Matches the list ordering (created_at DESC, id DESC) — the samples list is
    # server-paginated, so every page read hits this index instead of sorting the table.
    __table_args__ = (
        Index("ix_sample_requests_created_at", text("created_at DESC"), text("id DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    sales_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_orders.id"), nullable=True, index=True
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partners.id"), nullable=True, index=True
    )
    base_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id"), nullable=True, index=True
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    request_date: Mapped[date] = mapped_column(Date, default=date.today)
    project: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_article_code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    internal_article_code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    width: Mapped[str | None] = mapped_column(String(64), nullable=True)
    main_material: Mapped[str | None] = mapped_column(String(255), nullable=True)
    middle_material: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bottom_material: Mapped[str | None] = mapped_column(String(255), nullable=True)
    weft: Mapped[str | None] = mapped_column(String(255), nullable=True)
    warp: Mapped[str | None] = mapped_column(String(255), nullable=True)
    original_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    original_weight_unit: Mapped[str | None] = mapped_column(String(16), nullable=True)
    production_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    production_weight_unit: Mapped[str | None] = mapped_column(String(16), nullable=True)
    additional_info: Mapped[str | None] = mapped_column(Text, nullable=True)
    quantity: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sample_size: Mapped[str | None] = mapped_column(String(255), nullable=True)
    estimated_completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completion_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    variant_type: Mapped[str] = mapped_column(String(16), default="color")
    # Request classification, picked from the `Sample Category` system attribute
    # (system_role='sample_category', seeded with New Sample / Re Sample / Yardage).
    # Users add their own categories on the Attributes page, so this is NOT a closed
    # enum: `category_value_id` is the real link and `category` is a display snapshot
    # of the picked value (same shape as dye recipe wash bath / finishing steps).
    category: Mapped[str] = mapped_column(String(64), default="New Sample", index=True)
    category_value_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attribute_values.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(32), default="DRAFT", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    completion_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    design_pdf_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sales_order = relationship("SalesOrder", backref="samples")
    customer = relationship("Partner", foreign_keys=[customer_id])
    colors = relationship("SampleColor", order_by="SampleColor.order", cascade="all, delete-orphan")
    created_by = relationship("User", foreign_keys=[created_by_id])


class SampleRequestRead(Base):
    __tablename__ = "sample_request_reads"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    sample_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample_requests.id", ondelete="CASCADE"), primary_key=True
    )
    read_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
