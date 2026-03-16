import pytest
import os

# Set a default DATABASE_URL before importing app to avoid interpolation errors in session.py
# Can be overridden by environment (e.g. DATABASE_URL=...@db:5432/... in Docker)
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://erp:erp@localhost:5432/erp")

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.db.session import get_db, engine
from app.core.security import create_access_token
from app.models.auth import User
import uuid

# Use the existing engine but wrap in a transaction that rolls back
@pytest.fixture(scope="function")
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def test_user(db_session):
    # Create a test admin user in the rollback session (for sync routes / get_current_user)
    user = User(
        username="testadmin",
        full_name="Test Admin",
        hashed_password="hashed_secret", # We won't login via API, just mock token
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    # Also mirror the user into the REAL DB so async routes (audit service) can
    # satisfy FK constraints on audit_logs.user_id. Use the same UUID.
    from app.db.session import engine as _eng
    from sqlalchemy.orm import Session as _SASession
    _real_conn = _eng.connect()
    _real_sess = _SASession(_real_conn)
    _real_user_inserted = False
    try:
        _real_user = User(
            id=user.id,
            username=f"testadmin-{str(user.id)[:8]}",
            full_name="Test Admin",
            hashed_password="hashed_secret",
        )
        _real_sess.add(_real_user)
        _real_sess.commit()
        _real_user_inserted = True
    except Exception:
        _real_sess.rollback()

    yield user

    # Cleanup real DB user after test
    try:
        if _real_user_inserted:
            _real_sess.query(User).filter(User.id == user.id).delete(synchronize_session=False)
            _real_sess.commit()
    except Exception:
        _real_sess.rollback()
    finally:
        _real_sess.close()
        _real_conn.close()

@pytest.fixture(scope="function")
def auth_headers(test_user):
    token = create_access_token(subject=test_user.id)
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture(autouse=True)
def dispose_async_engine_pool():
    """
    Dispose the asyncpg connection pool after each test.
    Each TestClient creates a new anyio event loop; asyncpg connections are tied
    to a specific event loop, so connections from test N cannot be reused in test N+1.
    Disposing the pool forces fresh connections bound to the new event loop.
    """
    yield
    from app.core.db_manager import db_manager
    if db_manager.async_engine is not None:
        # dispose() on AsyncEngine is async; access the underlying sync pool directly
        db_manager.async_engine.sync_engine.pool.dispose()
