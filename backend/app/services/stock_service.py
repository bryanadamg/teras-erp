from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.stock_ledger import StockLedger
from fastapi import HTTPException

from app.models.attribute import AttributeValue

def get_stock_balance(db: Session, item_id, location_id, attribute_value_ids: list[str] = []):
    """
    Calculate exact stock balance for an item+location+attributes combination.
    """
    # 1. Fetch all ledger entries for this item and location
    query = db.query(StockLedger).filter(
        StockLedger.item_id == item_id,
        StockLedger.location_id == location_id
    )
    entries = query.all()
    
    # 2. Filter in memory for exact attribute match
    # (SQLAlchemy many-to-many filtering for *exact* set match is complex/slow without specific schema optimization)
    target_attr_set = set(str(uid) for uid in attribute_value_ids)
    
    total = 0.0
    for entry in entries:
        entry_attr_set = set(str(v.id) for v in entry.attribute_values)
        if entry_attr_set == target_attr_set:
            total += float(entry.qty_change)
            
    return total

def add_stock_entry(
    db: Session,
    item_id,
    location_id,
    qty_change,
    reference_type,
    reference_id,
    attribute_value_ids: list[str] = []
):
    # Prevent Negative Stock
    if qty_change < 0:
        current_balance = get_stock_balance(db, item_id, location_id, attribute_value_ids)
        if current_balance + qty_change < 0:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient stock. Current: {current_balance}, Required: {abs(qty_change)}"
            )

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



def get_stock_entries(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(StockLedger)
        .order_by(StockLedger.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_all_stock_balances(db: Session, user=None):
    """
    Optimized: Uses SQL SUM and GROUP BY to handle hundreds of thousands of rows
    without loading them all into Python memory.
    """
    from app.models.item import Item 
    from app.models.stock_ledger import stock_ledger_values
    
    # 1. Base query for total sum grouped by item and location
    # Note: Handling many-to-many attribute values in GROUP BY is tricky in SQL.
    # For MVP, we group by item and location. If exact variant tracking is needed at scale,
    # we would use a materialized view or a cached balance table.
    
    query = db.query(
        StockLedger.item_id,
        StockLedger.location_id,
        func.sum(StockLedger.qty_change).label("total_qty")
    )
    
    if user and user.allowed_categories:
        query = query.join(Item, StockLedger.item_id == Item.id).filter(Item.category.in_(user.allowed_categories))
        
    results = query.group_by(StockLedger.item_id, StockLedger.location_id).all()
    
    # Format for response
    return [
        {
            "item_id": r.item_id,
            "location_id": r.location_id,
            "attribute_value_ids": [], # Simplified for performance at scale
            "qty": float(r.total_qty)
        }
        for r in results if r.total_qty != 0
    ]

