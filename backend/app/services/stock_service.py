from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.stock_ledger import StockLedger

from app.models.attribute import AttributeValue

def add_stock_entry(
    db: Session,
    item_id,
    location_id,
    qty_change,
    reference_type,
    reference_id,
    attribute_value_ids: list[str] = []
):
    entry = StockLedger(
        item_id=item_id,
        location_id=location_id,
        qty_change=qty_change,
        reference_type=reference_type,
        reference_id=reference_id
    )
    
    if attribute_value_ids:
        vals = db.query(AttributeValue).filter(AttributeValue.id.in_(attribute_value_ids)).all()
        entry.attribute_values = vals

    db.add(entry)
    db.commit()


def get_stock_balance(db: Session, item_id, location_id, attribute_value_ids: list[str] = []):
    # This is complex for multiple values. 
    # Usually we need to check if the set of values matches exactly.
    # For now, we'll implement a basic filter.
    query = db.query(func.sum(StockLedger.qty_change)).filter(
        StockLedger.item_id == item_id,
        StockLedger.location_id == location_id
    )
    
    if attribute_value_ids:
        for val_id in attribute_value_ids:
            query = query.filter(StockLedger.attribute_values.any(AttributeValue.id == val_id))
        
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
    # For many-to-many, we fetch all entries and group in memory for simplicity in this dev phase
    # or use a complex SQL array aggregation. 
    entries = db.query(StockLedger).all()
    
    balances = {}
    
    for e in entries:
        # Create a unique key for the combination
        val_ids = sorted([str(v.id) for v in e.attribute_values])
        key = (str(e.item_id), str(e.location_id), ",".join(val_ids))
        
        if key not in balances:
            balances[key] = {
                "item_id": e.item_id,
                "location_id": e.location_id,
                "attribute_value_ids": [v.id for v in e.attribute_values],
                "qty": 0
            }
        balances[key]["qty"] += float(e.qty_change)
    
    return [b for b in balances.values() if b["qty"] != 0]

