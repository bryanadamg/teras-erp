import uuid
from sqlalchemy import String, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

class Item(Base):
    __tablename__ = "items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    uom: Mapped[str] = mapped_column(String(32))
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    
    # Lineage: Link to the sample this item was derived from
    source_sample_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id"), nullable=True
    )

    active: Mapped[bool] = mapped_column(Boolean, default=True)

    variants = relationship("Variant", backref="item", cascade="all, delete-orphan")
    
    # Relationship for the self-referential key
    source_sample = relationship("Item", remote_side=[id], backref="derived_items")
