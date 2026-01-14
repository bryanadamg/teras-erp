from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.stock_ledger import StockLedger

def add_stock_entry(
    db: Session,
    item_id,
    location_id,
    qty_change,
    reference_type,
    reference_id,
    attribute_value_id=None
):
    entry = StockLedger(
        item_id=item_id,
        location_id=location_id,
        attribute_value_id=attribute_value_id,
        qty_change=qty_change,
        reference_type=reference_type,
        reference_id=reference_id
    )
    db.add(entry)
    db.commit()


def get_stock_balance(db: Session, item_id, location_id, attribute_value_id=None):
    query = db.query(func.sum(StockLedger.qty_change)).filter(
        StockLedger.item_id == item_id,
        StockLedger.location_id == location_id
    )
    if attribute_value_id:
        query = query.filter(StockLedger.attribute_value_id == attribute_value_id)
        
    return query.scalar() or 0


def get_stock_entries(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(StockLedger)
        .order_by(StockLedger.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_all_stock_balances(db: Session):
    # Aggregate sum of qty_change group by item, attribute_value, location
    results = db.query(
        StockLedger.item_id,
        StockLedger.attribute_value_id,
        StockLedger.location_id,
        func.sum(StockLedger.qty_change).label("qty")
    ).group_by(
        StockLedger.item_id,
        StockLedger.attribute_value_id,
        StockLedger.location_id
    ).having(func.sum(StockLedger.qty_change) != 0).all()
    
    return [
        {
            "item_id": r.item_id,
            "attribute_value_id": r.attribute_value_id,
            "location_id": r.location_id,
            "qty": r.qty
        }
        for r in results
    ]

