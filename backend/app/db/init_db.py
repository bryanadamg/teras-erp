import logging
from sqlalchemy import text
from app.db.session import engine
from app.db.base import Base

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_migrations():
    """
    Run ad-hoc migrations to fix schema discrepancies.
    This is a simple alternative to Alembic for this dev setup.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("COMMIT")) # Ensure clean state
            
            # 1. Add variant_id to stock_ledger if it doesn't exist
            try:
                conn.execute(text("ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES variants(id)"))
                conn.execute(text("COMMIT"))
                logger.info("Migration: Verified variant_id in stock_ledger")
            except Exception as e:
                logger.warning(f"Migration step 1 warning: {e}")

            # 2. Drop legacy 'variant' column from items
            try:
                conn.execute(text("ALTER TABLE items DROP COLUMN IF EXISTS variant"))
                conn.execute(text("COMMIT"))
                logger.info("Migration: Verified cleanup of items table")
            except Exception as e:
                logger.warning(f"Migration step 2 warning: {e}")

            # 3. Add category column to items if it doesn't exist
            try:
                conn.execute(text("ALTER TABLE items ADD COLUMN IF NOT EXISTS category VARCHAR(64)"))
                conn.execute(text("COMMIT"))
                logger.info("Migration: Verified category column in items")
            except Exception as e:
                logger.warning(f"Migration step 3 warning: {e}")

    except Exception as e:
        logger.error(f"Migration failed: {e}")

def init_db() -> None:
    logger.info("Creating initial data")
    Base.metadata.create_all(bind=engine)
    run_migrations()
    logger.info("Initial data created")

if __name__ == "__main__":
    init_db()
