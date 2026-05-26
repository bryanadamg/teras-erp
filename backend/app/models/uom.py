import uuid
from sqlalchemy import String, Numeric, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

class UOM(Base):
    __tablename__ = "uoms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # factors where this UOM is the FROM unit (e.g. Roll.factors = [Roll→yard=50])
    factors: Mapped[list["UOMFactor"]] = relationship(
        "UOMFactor",
        foreign_keys="UOMFactor.from_uom_id",
        back_populates="from_uom",
        cascade="all, delete-orphan",
        order_by="UOMFactor.value",
    )


class UOMFactor(Base):
    __tablename__ = "uom_factors"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    from_uom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uoms.id", ondelete="CASCADE"), index=True
    )
    to_uom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uoms.id", ondelete="CASCADE"), index=True
    )
    value: Mapped[float] = mapped_column(Numeric(14, 4))

    from_uom: Mapped["UOM"] = relationship("UOM", foreign_keys=[from_uom_id], back_populates="factors")
    to_uom: Mapped["UOM"] = relationship("UOM", foreign_keys=[to_uom_id])
