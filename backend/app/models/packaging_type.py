import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, Integer, DateTime, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class PackagingType(Base):
    """The physical box a carton is packed in — Box S/M/L/XL, Plastic Bag, Custom.

    Deliberately NOT an Item and NOT an attribute value:

    * Not an Item, because packaging is not stock-counted here. The packer states
      which box was used so its tare can be added to the net weight; nothing is
      issued, and the free-entry `PackingOrderMaterial` plan already covers the
      "we bought 500 cartons" side if it is ever wanted.
    * Not an AttributeValue, because `tare_kg` is the whole point and an
      attribute value has nowhere to put a number.

    `tare_kg` is the empty box's weight. `is_custom` marks the one row that has
    none — a custom box is weighed by hand at log time and the packer's reading
    is snapshotted onto the carton instead.
    """

    __tablename__ = "packaging_types"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128), index=True)
    # Empty-box weight in kg. Null/0 on the custom row, where it is typed per box.
    tare_kg: Mapped[Optional[float]] = mapped_column(Numeric(14, 4), nullable=True)
    # The one row whose tare is entered at pack time rather than read from here.
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
