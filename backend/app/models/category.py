import uuid
from sqlalchemy import String, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(64), index=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    parent: Mapped["Category | None"] = relationship(
        "Category", remote_side="Category.id", back_populates="children",
        lazy="joined", join_depth=2
    )
    children: Mapped[list["Category"]] = relationship(
        "Category", back_populates="parent", lazy="selectin", passive_deletes=True
    )

    @property
    def level(self) -> int:
        if self.parent_id is None:
            return 1
        if self.parent is None or self.parent.parent_id is None:
            return 2
        return 3

    @property
    def path_names(self) -> list[str]:
        if self.parent is None:
            return [self.name]
        if self.parent.parent is None:
            return [self.parent.name, self.name]
        return [self.parent.parent.name, self.parent.name, self.name]
