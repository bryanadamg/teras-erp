from datetime import timedelta
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.auth import User, Role
from app.models.audit import AuditLog
from app.schemas import UserResponse, RoleResponse, PermissionResponse, UserUpdate, UserCreate
from app.core.security import verify_password, create_access_token, get_password_hash, ALGORITHM, SECRET_KEY
from jose import JWTError, jwt

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/token")

# --- Dependencies ---
def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user

def get_current_active_user(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user

def get_current_admin(current_user: Annotated[User, Depends(get_current_user)]):
    if not current_user.role or current_user.role.name != "Administrator":
        raise HTTPException(status_code=403, detail="Not authorized")
    return current_user

def _count_active_admins(db: Session, exclude_user_id: str | None = None) -> int:
    query = db.query(User).join(Role, User.role_id == Role.id).filter(
        Role.name == "Administrator", User.is_active == True
    )
    if exclude_user_id is not None:
        query = query.filter(User.id != exclude_user_id)
    return query.count()

def _log_activity(db: Session, user_id, action: str, entity_id, details: str | None = None):
    db.add(AuditLog(user_id=user_id, action=action, entity_type="User", entity_id=str(entity_id), details=details))
    db.commit()

# --- Endpoints ---

@router.post("/token")
def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password) or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(subject=user.id)
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/users/me", response_model=UserResponse)
def read_users_me(current_user: Annotated[User, Depends(get_current_active_user)]):
    return current_user

@router.get("/users", response_model=list[UserResponse])
def get_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(User).all()

@router.get("/roles", response_model=list[RoleResponse])
def get_roles(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Role).all()

@router.get("/permissions", response_model=list[PermissionResponse])
def get_permissions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.auth import Permission
    return db.query(Permission).all()

@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    role = None
    if payload.role_id is not None:
        role = db.query(Role).filter(Role.id == payload.role_id).first()
        if not role:
            raise HTTPException(status_code=400, detail="Role not found")

    from app.models.auth import Permission
    perms = db.query(Permission).filter(Permission.id.in_(payload.permission_ids)).all() if payload.permission_ids else []

    user = User(
        username=payload.username,
        full_name=payload.full_name,
        hashed_password=get_password_hash(payload.password),
        role_id=role.id if role else None,
        permissions=perms,
        allowed_categories=payload.allowed_categories,
        avatar_id=payload.avatar_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _log_activity(db, current_user.id, "CREATE", user.id, details=f"Created user {user.username}")
    return user

@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(user_id: str, payload: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    is_self = str(current_user.id) == str(user_id)
    is_admin = bool(current_user.role and current_user.role.name == "Administrator")

    if not is_self and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Only admins may change role, granular permissions, or category restrictions
    if not is_admin and (payload.role_id is not None or payload.permission_ids is not None or payload.allowed_categories is not None):
        raise HTTPException(status_code=403, detail="Not authorized")

    if payload.username is not None and payload.username != user.username:
        # Check if username exists
        if db.query(User).filter(User.username == payload.username).first():
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = payload.username

    if payload.full_name is not None:
        user.full_name = payload.full_name

    if payload.role_id is not None:
        role = db.query(Role).filter(Role.id == payload.role_id).first()
        if not role:
            raise HTTPException(status_code=400, detail="Role not found")
        was_admin = bool(user.role and user.role.name == "Administrator")
        if was_admin and role.name != "Administrator" and _count_active_admins(db, exclude_user_id=user.id) < 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last active Administrator")
        user.role_id = role.id

    if payload.password is not None:
        user.hashed_password = get_password_hash(payload.password)

    if payload.permission_ids is not None:
        from app.models.auth import Permission
        perms = db.query(Permission).filter(Permission.id.in_(payload.permission_ids)).all()
        user.permissions = perms

    if payload.allowed_categories is not None:
        user.allowed_categories = payload.allowed_categories

    if payload.avatar_id is not None:
        user.avatar_id = payload.avatar_id

    db.commit()
    db.refresh(user)
    _log_activity(db, current_user.id, "UPDATE", user.id, details=f"Updated user {user.username}")
    return user

@router.post("/users/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(user_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role and user.role.name == "Administrator" and _count_active_admins(db, exclude_user_id=user.id) < 1:
        raise HTTPException(status_code=400, detail="Cannot deactivate the last active Administrator")

    user.is_active = False
    db.commit()
    db.refresh(user)
    _log_activity(db, current_user.id, "DEACTIVATE", user.id, details=f"Deactivated user {user.username}")
    return user

@router.post("/users/{user_id}/reactivate", response_model=UserResponse)
def reactivate_user(user_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = True
    db.commit()
    db.refresh(user)
    _log_activity(db, current_user.id, "REACTIVATE", user.id, details=f"Reactivated user {user.username}")
    return user