import logging
from sqlalchemy import text
from app.db.session import engine
from app.db.base import Base

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_migrations():
    """
    Run ad-hoc migrations to fix schema discrepancies.
    Using connection.commit() instead of raw SQL COMMIT to avoid transaction warnings.
    """
    try:
        with engine.connect() as conn:
            # 1. Verification of missing columns in existing tables
            migrations = [
                ("items", "category", "VARCHAR(64)"),
                ("items", "source_sample_id", "UUID REFERENCES items(id)"),
                ("items", "attribute_id", "UUID REFERENCES attributes(id)"),
                ("work_orders", "location_id", "UUID REFERENCES locations(id)"),
            ]

            for table, col, col_type in migrations:
                try:
                    # Check if column exists
                    res = conn.execute(text(f"SELECT column_name FROM information_schema.columns WHERE table_name='{table}' AND column_name='{col}'"))
                    if not res.fetchone():
                        logger.info(f"Migration: Adding {col} to {table}")
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                        conn.commit()
                except Exception as e:
                    logger.warning(f"Migration for {table}.{col} failed: {e}")

            # 2. Data Migration: Move single attribute_id/attribute_value_id to secondary tables if data exists
            # These are the many-to-many migrations
            move_data = [
                ("items", "attribute_id", "item_attributes", "item_id", "attribute_id"),
                ("stock_ledger", "attribute_value_id", "stock_ledger_values", "stock_ledger_id", "attribute_value_id"),
                ("boms", "attribute_value_id", "bom_values", "bom_id", "attribute_value_id"),
                ("bom_lines", "attribute_value_id", "bom_line_values", "bom_line_id", "attribute_value_id"),
                ("work_orders", "attribute_value_id", "work_order_values", "work_order_id", "attribute_value_id")
            ]

            for src_table, src_col, target_table, target_id_col, target_val_col in move_data:
                try:
                    # Check if src_col exists before attempting migration
                    res = conn.execute(text(f"SELECT column_name FROM information_schema.columns WHERE table_name='{src_table}' AND column_name='{src_col}'"))
                    if res.fetchone():
                        conn.execute(text(f"""
                            INSERT INTO {target_table} ({target_id_col}, {target_val_col}) 
                            SELECT id, {src_col} FROM {src_table} 
                            WHERE {src_col} IS NOT NULL 
                            ON CONFLICT DO NOTHING
                        """))
                        conn.commit()
                        logger.info(f"Migration: Moved {src_col} data to {target_table}")
                except Exception as e:
                    pass

            # 3. Verify Routing Tables (WorkCenter, Operation)
            try:
                # Just a simple check to ensure they exist (create_all should have handled it)
                conn.execute(text("SELECT 1 FROM work_centers LIMIT 1"))
                conn.execute(text("SELECT 1 FROM operations LIMIT 1"))
                logger.info("Migration: Verified routing tables")
            except Exception as e:
                pass

    except Exception as e:
        logger.error(f"Migration engine failed: {e}")

from app.models.category import Category

def seed_categories(db):
    try:
        if db.query(Category).count() == 0:
            defaults = ["Raw Material", "WIP", "Finished Goods", "Sample", "Consumable"]
            for name in defaults:
                db.add(Category(name=name))
            db.commit()
            logger.info("Seeded default categories")
    except Exception as e:
        logger.warning(f"Category seeding skipped: {e}")

def init_db() -> None:
    logger.info("Initializing Database...")
    # 1. Create all tables (including association tables registered in base.py)
    Base.metadata.create_all(bind=engine)
    
    # 2. Run ad-hoc column migrations
    run_migrations()
    
    # 3. Seed data
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        seed_categories(db)
    finally:
        db.close()
        
    logger.info("Database initialization complete.")

if __name__ == "__main__":
    init_db()