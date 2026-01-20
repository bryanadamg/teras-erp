import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, Integer, Text, DateTime, Table, Column
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

# Association table for Sample <-> AttributeValue
sample_attribute_values = Table(
    "sample_attribute_values",
    Base.metadata,
    Column("sample_request_id", UUID(as_uuid=True), ForeignKey("sample_requests.id"), primary_key=True),
    Column("attribute_value_id", UUID(as_uuid=True), ForeignKey("attribute_values.id"), primary_key=True),
)

class SampleRequest(Base):
    __tablename__ = "sample_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True) # e.g. SMP-2026-001
    
    # Link to the Incoming PO (Demand)
    sales_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_orders.id"), nullable=True
    )
    
    # Link to the Generic Item Definition (e.g. "T-Shirt")
    base_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id")
    )
    
    version: Mapped[int] = mapped_column(Integer, default=1) # V1, V2, etc.
    status: Mapped[str] = mapped_column(String(32), default="DRAFT") 
    # DRAFT, IN_PRODUCTION, SENT, PENDING_APPROVAL, APPROVED, REJECTED
    
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Relationships
    base_item = relationship("Item")
    sales_order = relationship("SalesOrder", backref="samples")
    attribute_values = relationship("AttributeValue", secondary=sample_attribute_values)
