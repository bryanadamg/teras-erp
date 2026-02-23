import os
import random
import uuid
import time
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Use the Docker DB if running from host, or change to localhost
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://erp:erp@localhost:5432/erp")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def seed_volume():
    db = SessionLocal()
    print(f"--- STARTING VOLUME SEEDING ON {DATABASE_URL} ---")
    start_time = time.time()

    # 1. Clear existing data (Optional, be careful)
    # db.execute(text("TRUNCATE items, stock_ledger CASCADE"))
    # db.commit()

    # 2. Bulk Insert Items
    print("Seeding 50,000 Items...")
    batch_size = 5000
    for i in range(10): # 10 batches of 5k = 50k
        items = []
        for j in range(batch_size):
            code = f"VOL-ITM-{i}-{j}"
            name = f"Volume Stress Item {i*batch_size + j}"
            items.append({
                "id": uuid.uuid4(),
                "code": code,
                "name": name,
                "uom": "pcs",
                "category": "WIP",
                "active": True
            })
        
        db.execute(
            text("INSERT INTO items (id, code, name, uom, category, active) VALUES (:id, :code, :name, :uom, :category, :active)"),
            items
        )
        db.commit()
        print(f"Inserted batch {i+1}/10")

    # 3. Bulk Insert Stock Ledger
    print("Seeding 100,000 Stock Ledger entries...")
    # Get some valid IDs
    item_ids = [r[0] for r in db.execute(text("SELECT id FROM items LIMIT 1000")).fetchall()]
    loc_ids = [r[0] for r in db.execute(text("SELECT id FROM locations LIMIT 5")).fetchall()]
    
    if not loc_ids:
        print("Error: Please create at least one location first.")
        return

    for b in range(20): # 20 batches of 5k = 100k
        entries = []
        for _ in range(batch_size):
            entries.append({
                "id": uuid.uuid4(),
                "item_id": random.choice(item_ids),
                "location_id": random.choice(loc_ids),
                "qty_change": random.uniform(1, 100),
                "reference_type": "StressTest",
                "reference_id": "SIM-BATCH",
                "created_at": "2026-01-01 00:00:00"
            })
        db.execute(
            text("INSERT INTO stock_ledger (id, item_id, location_id, qty_change, reference_type, reference_id, created_at) VALUES (:id, :item_id, :location_id, :qty_change, :reference_type, :reference_id, :created_at)"),
            entries
        )
        db.commit()
        print(f"Ledger batch {b+1}/20")

    end_time = time.time()
    print(f"--- COMPLETED IN {round(end_time - start_time, 2)} seconds ---")

if __name__ == "__main__":
    seed_volume()
