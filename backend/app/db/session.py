import os
from app.core.db_manager import db_manager

# Default configuration from Environment
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://erp:erp@db:5432/erp"
)

# Initialize the manager with the default URL on first load
if not db_manager.current_url:
    db_manager.initialize(DATABASE_URL)

# Dynamically return the engine to ensure it's always current
@property
def engine():
    return db_manager.engine

# Dependency for FastAPI
def get_db():
    yield from db_manager.get_session()
