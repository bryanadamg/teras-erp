import pytest
import os

# Set a dummy DATABASE_URL before importing app to avoid interpolation errors in session.py
os.environ["DATABASE_URL"] = "postgresql+psycopg2://erp:erp@localhost:5432/erp"

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
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def test_user(db_session):
    # Create a test admin user
    user = User(
        username="testadmin",
        full_name="Test Admin",
        hashed_password="hashed_secret", # We won't login via API, just mock token
        role="admin",
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture(scope="function")
def auth_headers(test_user):
    token = create_access_token(data={"sub": test_user.username})
    return {"Authorization": f"Bearer {token}"}
