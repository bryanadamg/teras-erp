import uuid
from sqlalchemy import String, ForeignKey, inspect as sa_inspect
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship, backref
from app.db.base import Base


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))

    # 'warehouse' | 'zone' | 'bin'  (inferred from parent on create, never changes)
    location_type: Mapped[str] = mapped_column(String(10), nullable=False, default='bin')

    # Non-null = system-seeded row; cannot be renamed or deleted
    system_code: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True)

    # Self-referential 3-level hierarchy:
    #   warehouse (parent_id IS NULL)
    #   zone      (parent_id → warehouse)
    #   bin       (parent_id → zone)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    # parent: joined (to-one) so parent_name is always available.
    # children: selectin so has_children is safe to read in async routes
    #   (Location is serialized inside async MO/PR trees via input/output_location).
    parent = relationship(
        "Location",
        remote_side="Location.id",
        backref=backref("children", lazy="selectin"),
        lazy="joined",
    )

    # These properties must NEVER trigger lazy IO — Location is serialized inside
    # async routes (MO/PR trees) where the relationships may not be eager-loaded.
    @property
    def parent_name(self) -> str | None:
        if "parent" in sa_inspect(self).unloaded:
            return None
        return self.parent.name if self.parent else None

    @property
    def has_children(self) -> bool:
        if "children" in sa_inspect(self).unloaded:
            return False
        return len(self.children) > 0
