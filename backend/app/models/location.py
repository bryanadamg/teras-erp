import uuid
from sqlalchemy import String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))

    # Self-referential 2-level hierarchy:
    #   top-level (parent_id is NULL) = warehouse / area
    #   child (parent_id set)         = spot / bin where stock actually sits
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    parent = relationship(
        "Location", remote_side="Location.id", backref="children", lazy="joined"
    )

    @property
    def parent_name(self) -> str | None:
        return self.parent.name if self.parent else None

    @property
    def has_children(self) -> bool:
        return len(self.children) > 0
