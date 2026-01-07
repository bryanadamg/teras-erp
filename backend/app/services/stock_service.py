from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.stock_ledger import StockLedger

def add_stock_entry(
    db: Session,
    item_id,
    location_id,
    qty_change,
    reference_type,
    reference_id
):
    entry = StockLedger(
        item_id=item_id,
        location_id=location_id,
        qty_change=qty_change,
        reference_type=reference_type,
        reference_id=reference_id
    )
    db.add(entry)
    db.commit()


def get_stock_balance(db: Session, item_id, location_id):
    return (
        db.query(func.sum(StockLedger.qty_change))
        .filter(
            StockLedger.item_id == item_id,
            StockLedger.location_id == location_id
        )
        .scalar()
        or 0
    )
