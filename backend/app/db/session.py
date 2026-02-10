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

# For direct engine access
def get_engine():
    return db_manager.engine

# For legacy scripts and backward compatibility
# Note: This is now a function that returns a session, 
# which works as a context manager in SQLAlchemy 1.4+
def SessionLocal():
    return db_manager.session_factory()

# Backward compatibility for direct engine import
# WARNING: If database is hot-swapped, this specific reference might become stale
# if it was imported as 'from app.db.session import engine'.
# Modules should prefer using get_engine() or db_manager.engine.
engine = db_manager.engine

# Dependency for FastAPI
def get_db():
    yield from db_manager.get_session()