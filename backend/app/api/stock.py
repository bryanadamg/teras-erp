from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_async_db
from app.services import stock_service, audit_service
from app.schemas import StockLedgerResponse, StockBalanceResponse, PaginatedStockLedgerResponse, StockEntryCreate, StockTransferCreate
from app.models.auth import User
from app.api.auth import get_current_user
from app.models.item import Item
from app.models.location import Location
from datetime import datetime
from typing import Optional

router = APIRouter()

@router.get("/stock", response_model=PaginatedStockLedgerResponse)
async def get_stock_ledger(
    skip: int = 0, 
    limit: int = 100, 
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.stock_ledger import StockLedger
    query = select(StockLedger)
    
    if start_date:
        query = query.filter(StockLedger.created_at >= start_date)
    if end_date:
        query = query.filter(StockLedger.created_at <= end_date)
        
    # Count total
    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()
    
    # Get items
    result = await db.execute(
        query.order_by(StockLedger.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    items = result.scalars().all()
    
    return {
        "items": items,
        "total": total,
        "page": (skip // limit) + 1,
        "size": len(items)
    }

@router.post("/stock", status_code=201)
async def create_stock_entry(
    payload: StockEntryCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    item_result = await db.execute(select(Item).filter(Item.code == payload.item_code))
    item = item_result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Item '{payload.item_code}' not found")

    loc_result = await db.execute(select(Location).filter(Location.code == payload.location_code))
    location = loc_result.scalars().first()
    if not location:
        raise HTTPException(status_code=404, detail=f"Location '{payload.location_code}' not found")

    attribute_value_ids = [str(uid) for uid in payload.attribute_value_ids]
    await stock_service.add_stock_entry(
        db=db,
        item_id=item.id,
        location_id=location.id,
        qty_change=payload.qty,
        reference_type=payload.reference_type,
        reference_id=payload.reference_id,
        attribute_value_ids=attribute_value_ids,
        cones_change=payload.qty_cones or 0,
        boxes_change=payload.qty_boxes or 0,
        drums_change=payload.qty_drums or 0,
    )

    await audit_service.log_activity(
        db=db,
        user_id=current_user.id,
        action="create",
        entity_type="stock_entry",
        entity_id=str(item.id),
        changes={"item": payload.item_code, "location": payload.location_code, "qty": payload.qty},
    )

    return {"status": "success", "message": "Stock entry recorded"}


@router.post("/stock/transfer", status_code=201)
async def transfer_stock(
    payload: StockTransferCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    if payload.qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be positive")
    if payload.from_location_id == payload.to_location_id:
        raise HTTPException(status_code=400, detail="Source and destination locations must differ")

    item_result = await db.execute(select(Item).filter(Item.id == payload.item_id))
    item = item_result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    loc_result = await db.execute(
        select(Location).filter(Location.id.in_([payload.from_location_id, payload.to_location_id]))
    )
    locs = {loc.id: loc for loc in loc_result.scalars().all()}
    if len(locs) != 2:
        raise HTTPException(status_code=404, detail="Location not found")

    if item.lot_tracked and not payload.batch_id:
        raise HTTPException(status_code=400, detail=f"Item {item.code} is lot-tracked — select a lot/batch to transfer")

    attrs = [str(u) for u in payload.attribute_value_ids]
    ref = f"{locs[payload.from_location_id].code} -> {locs[payload.to_location_id].code}"

    c = payload.qty_cones or 0
    b = payload.qty_boxes or 0
    d = payload.qty_drums or 0

    # OUT first — per-batch negative stock guard blocks over-transfer
    await stock_service.add_stock_entry(
        db, item_id=item.id, location_id=payload.from_location_id,
        qty_change=-payload.qty, reference_type="Transfer", reference_id=ref,
        attribute_value_ids=attrs, batch_id=payload.batch_id,
        cones_change=-c, boxes_change=-b, drums_change=-d,
    )
    await stock_service.add_stock_entry(
        db, item_id=item.id, location_id=payload.to_location_id,
        qty_change=payload.qty, reference_type="Transfer", reference_id=ref,
        attribute_value_ids=attrs, batch_id=payload.batch_id,
        cones_change=c, boxes_change=b, drums_change=d,
    )

    await audit_service.log_activity(
        db=db,
        user_id=current_user.id,
        action="TRANSFER",
        entity_type="stock_entry",
        entity_id=str(item.id),
        changes={"item": item.code, "qty": payload.qty, "route": ref, "batch_id": str(payload.batch_id) if payload.batch_id else None},
    )
    return {"status": "success", "message": "Transfer recorded"}


@router.get("/stock/balance", response_model=list[StockBalanceResponse])
async def get_stock_balance_api(db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    return await stock_service.get_all_stock_balances(db, user=current_user)
