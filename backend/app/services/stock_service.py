from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.stock_ledger import StockLedger
from app.models.stock_balance import StockBalance
from app.models.attribute import AttributeValue
from fastapi import HTTPException

def _generate_variant_key(attribute_value_ids: list[str]) -> str:
    """Standardizes variant identification string."""
    return ",".join(sorted(str(uid) for uid in attribute_value_ids))

def get_stock_balance(db: Session, item_id, location_id, attribute_value_ids: list[str] = []):
    """
    PRE-CALCULATED O(1) LOOKUP: 
    Retrieves the exact balance from the summary table instead of summing the ledger.
    """
    v_key = _generate_variant_key(attribute_value_ids)
    balance = db.query(StockBalance).filter(
        StockBalance.item_id == item_id,
        StockBalance.location_id == location_id,
        StockBalance.variant_key == v_key
    ).first()
    
    return float(balance.qty) if balance else 0.0

def add_stock_entry(
    db: Session,
    item_id,
    location_id,
    qty_change,
    reference_type,
    reference_id,
    attribute_value_ids: list[str] = []
):
    # 1. Prevent Negative Stock (using pre-calculated balance)
    if qty_change < 0:
        current_balance = get_stock_balance(db, item_id, location_id, attribute_value_ids)
        if current_balance + qty_change < 0:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient stock. Current: {current_balance}, Required: {abs(qty_change)}"
            )

    # 2. Create the Ledger Entry (for Audit/History)
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

    # 3. ATOMIC SUMMARY UPDATE (The Materialized View Logic)
    v_key = _generate_variant_key(attribute_value_ids)
    balance = db.query(StockBalance).filter(
        StockBalance.item_id == item_id,
        StockBalance.location_id == location_id,
        StockBalance.variant_key == v_key
    ).first()

    if not balance:
        # Create new balance record
        balance = StockBalance(
            item_id=item_id,
            location_id=location_id,
            variant_key=v_key,
            qty=qty_change
        )
        # Link attribute values for traceability in the summary too
        if attribute_value_ids:
            vals = db.query(AttributeValue).filter(AttributeValue.id.in_(attribute_value_ids)).all()
            balance.attribute_values = vals
        db.add(balance)
    else:
        # Update existing balance
        balance.qty = float(balance.qty) + float(qty_change)

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
    ENTERPRISE SCALE: Returns pre-calculated totals directly from the summary table.
    """
    from app.models.item import Item 
    
    query = db.query(StockBalance)
    
    if user and user.allowed_categories:
        query = query.join(Item, StockBalance.item_id == Item.id).filter(Item.category.in_(user.allowed_categories))
        
    results = query.all()
    
    return [
        {
            "item_id": r.item_id,
            "location_id": r.location_id,
            "attribute_value_ids": [v.id for v in r.attribute_values],
            "qty": float(r.qty)
        }
        for r in results if r.qty != 0
    ]

def get_batch_stock_balances(db: Session, requirements: list[dict]):
    """
    BATCH O(1) LOOKUP: 
    Returns a dictionary keyed by (item_id, location_id, attr_string) -> balance.
    Extremely efficient for Work Order material checks.
    """
    results_map = {}
    
    # Extract unique requirement keys
    unique_keys = set((str(req['item_id']), str(req['location_id']), _generate_variant_key(req['attribute_value_ids'])) for req in requirements)
    
    # Fetch all relevant balances in ONE query
    # Since we use variant_key, we can do a very fast filtered fetch
    if not unique_keys:
        return {}

    # Note: SQLAlchemy IN clause with multiple columns is tricky, 
    # for simplicity and performance we'll just fetch by item_ids then filter.
    item_ids = set(req['item_id'] for req in requirements)
    balances = db.query(StockBalance).filter(StockBalance.item_id.in_(item_ids)).all()

    for b in balances:
        key = (str(b.item_id), str(b.location_id), b.variant_key)
        results_map[key] = float(b.qty)
            
    return results_map
