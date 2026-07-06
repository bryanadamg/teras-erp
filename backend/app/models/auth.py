import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Table, Column, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

# Association table for Role <-> Permission
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", UUID(as_uuid=True), ForeignKey("roles.id"), primary_key=True),
    Column("permission_id", UUID(as_uuid=True), ForeignKey("permissions.id"), primary_key=True),
)

# Association table for User <-> Permission (Granular access)
user_permissions = Table(
    "user_permissions",
    Base.metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True),
    Column("permission_id", UUID(as_uuid=True), ForeignKey("permissions.id"), primary_key=True),
)

class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True) # e.g. "inventory.item.create"
    description: Mapped[str] = mapped_column(String(255))

class Role(Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True) # e.g. "Manager"
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Work-center-type restriction for work_order.* actions (If Null, allow all types).
    allowed_work_center_types: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    permissions = relationship("Permission", secondary=role_permissions)

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(128))
    hashed_password: Mapped[str] = mapped_column(String(255)) # New field for security
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id"), nullable=True
    )

    # Category-based restriction (If Null, allow all. If set, allow only these categories)
    allowed_categories: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    avatar_id: Mapped[str | None] = mapped_column(String(4), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    role = relationship("Role")
    permissions = relationship("Permission", secondary=user_permissions)
    bom_automator_profiles = relationship("BOMAutomatorProfile", back_populates="user", cascade="all, delete-orphan")
    preferences = relationship("UserPreference", back_populates="user", cascade="all, delete-orphan")


class BOMAutomatorProfile(Base):
    __tablename__ = "bom_automator_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    levels: Mapped[list] = mapped_column(JSON, nullable=False)

    user = relationship("User", back_populates="bom_automator_profiles")


class UserPreference(Base):
    __tablename__ = "user_preferences"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_user_preferences_user_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)

    user = relationship("User", back_populates="preferences")
