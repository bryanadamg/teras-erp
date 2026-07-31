import uuid
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Text, Numeric, Boolean, ForeignKey, JSON, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.location import Location

class WorkCenter(Base):
    __tablename__ = "work_centers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cost_per_hour: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    center_type: Mapped[str] = mapped_column(String(16), default="GENERAL")
    input_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)
    output_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)

    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("work_centers.id"), nullable=True, index=True)

    # Where this row sits in the 3-level tree: TYPE (root, e.g. WEAVING) → GROUP
    # (optional, e.g. a hall or loom bank) → MACHINE (leaf, the physical center all
    # WO/BOM/run rows point at). The GROUP tier is optional: a MACHINE may still
    # hang directly off a TYPE, which is how every pre-existing tree is shaped.
    # Depth is NOT inferred from parent_id — a group and a machine both have a
    # parent, so only this discriminator tells them apart.
    node_type: Mapped[str] = mapped_column(String(16), default="MACHINE", server_default="MACHINE", index=True)

    # Production calendar (performance monitoring): weekdays this machine runs.
    # 0=Mon .. 6=Sun. Default Mon-Fri. Non-working holidays live in work_center_holidays.
    working_weekdays: Mapped[list] = mapped_column(JSON, default=lambda: [0, 1, 2, 3, 4], server_default="[0, 1, 2, 3, 4]")

    # Beam positions on this machine (looms). Drives the pcs-based readiness
    # target for warp beams: a WEAVING WO is beam-ready when the loom has this
    # many beams mounted. Per-run line count lives on WeavingRun.lines instead —
    # this is fixed machine config ("tergantung pengaturannya").
    beam_slots: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    input_location: Mapped[Optional["Location"]] = relationship("Location", foreign_keys=[input_location_id], lazy="joined")
    output_location: Mapped[Optional["Location"]] = relationship("Location", foreign_keys=[output_location_id], lazy="joined")
    parent: Mapped[Optional["WorkCenter"]] = relationship("WorkCenter", back_populates="children", remote_side="WorkCenter.id", foreign_keys=[parent_id])
    children: Mapped[list["WorkCenter"]] = relationship("WorkCenter", back_populates="parent", foreign_keys=[parent_id])

class Operation(Base):
    __tablename__ = "operations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
