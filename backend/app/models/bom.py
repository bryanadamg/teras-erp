import uuid
from sqlalchemy import String, ForeignKey, Numeric, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

class BOM(Base):
    __tablename__ = "boms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Produced Item
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id"), index=True
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("variants.id"), nullable=True
    )
    qty: Mapped[float] = mapped_column(Numeric(14, 4), default=1.0)
    
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    lines = relationship("BOMLine", backref="bom", cascade="all, delete-orphan")


class BOMLine(Base):
    __tablename__ = "bom_lines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("boms.id"), index=True
    )
    
    # Material Item
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id")
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("variants.id"), nullable=True
    )
    
    qty: Mapped[float] = mapped_column(Numeric(14, 4))
