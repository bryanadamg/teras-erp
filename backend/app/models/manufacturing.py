from sqlalchemy import String, ForeignKey, Numeric, DateTime, Table, Column
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
import uuid
from datetime import datetime

# Association table for WorkOrder <-> AttributeValue
work_order_values = Table(
    "work_order_values",
    Base.metadata,
    Column("work_order_id", UUID(as_uuid=True), ForeignKey("work_orders.id"), primary_key=True),
    Column("attribute_value_id", UUID(as_uuid=True), ForeignKey("attribute_values.id"), primary_key=True),
)

class WorkOrder(Base):
    __tablename__ = "work_orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    
    # Link to the Recipe (BOM)
    bom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("boms.id"), index=True
    )
    
    # Redundant but useful for querying what is being made without joining BOM
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id")
    )

    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), index=True
    )
    
    # New: Where raw materials are taken from
    source_location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True
    )

    qty: Mapped[float] = mapped_column(Numeric(14, 4))
    
    # Status: PENDING, IN_PROGRESS, COMPLETED, CANCELLED
    status: Mapped[str] = mapped_column(String(32), default="PENDING")
    
    start_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    bom = relationship("BOM", backref="work_orders")
    attribute_values = relationship("AttributeValue", secondary=work_order_values)
