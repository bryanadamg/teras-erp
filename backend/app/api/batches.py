from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload, joinedload
from app.db.session import get_async_db
from app.models.batch import Batch, BatchConsumption
from app.models.item import Item
from app.models.stock_balance import StockBalance
from app.schemas import BatchCreate, BatchResponse, BatchTraceResponse, BatchConsumptionResponse, BatchTraceBackNode
from app.api.auth import get_current_user
from app.models.auth import User
from app.services import audit_service
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/batches", tags=["batches"])


def _build_batch_number(date_str: str, counter: int) -> str:
    return f"BAT-{date_str}-{str(counter).zfill(4)}"


async def generate_batch_number(db: AsyncSession, prefix: str = "BAT") -> str:
    """Next unique batch number for today: <prefix>-YYYYMMDD-NNNN."""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    full_prefix = f"{prefix}-{today}-"
    count_result = await db.execute(
        select(func.count()).select_from(Batch).filter(Batch.batch_number.like(f"{full_prefix}%"))
    )
    n = (count_result.scalar() or 0) + 1
    while True:
        candidate = f"{full_prefix}{str(n).zfill(4)}"
        check = await db.execute(select(Batch.id).filter(Batch.batch_number == candidate).limit(1))
        if check.scalars().first() is None:
            return candidate
        n += 1


@router.post("", response_model=BatchResponse)
async def create_batch(
    payload: BatchCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    item_result = await db.execute(select(Item).filter(Item.id == payload.item_id))
    item = item_result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    batch_number = await generate_batch_number(db)

    batch = Batch(
        batch_number=batch_number,
        item_id=payload.item_id,
        notes=payload.notes,
        created_by=current_user.username,
    )
    db.add(batch)
    await db.commit()
    await db.refresh(batch)
    batch.item_code = item.code
    batch.item_name = item.name

    await audit_service.log_activity(
        db, current_user.id, "CREATE", "Batch", str(batch.id),
        details=f"Created batch {batch_number} for item {payload.item_id}"
    )
    return batch


@router.get("", response_model=list[BatchResponse])
async def list_batches(
    item_id: uuid.UUID | None = Query(None),
    location_id: uuid.UUID | None = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Batch).options(joinedload(Batch.item)).order_by(Batch.created_at.desc())
    if item_id:
        query = query.filter(Batch.item_id == item_id)
    result = await db.execute(query.offset(skip).limit(limit))
    batches = result.scalars().all()

    # Attach remaining stock per batch (optionally scoped to a location)
    keys = [str(b.id) for b in batches]
    remaining_map: dict[str, float] = {}
    if keys:
        bal_q = (
            select(StockBalance.batch_key, func.sum(StockBalance.qty))
            .filter(StockBalance.batch_key.in_(keys))
            .group_by(StockBalance.batch_key)
        )
        if location_id:
            bal_q = bal_q.filter(StockBalance.location_id == location_id)
        bal_res = await db.execute(bal_q)
        remaining_map = {k: float(v or 0) for k, v in bal_res.all()}
    for b in batches:
        b.remaining = remaining_map.get(str(b.id), 0.0)
        b.item_code = b.item.code if b.item else None
        b.item_name = b.item.name if b.item else None
    return batches


@router.get("/{batch_id}", response_model=BatchResponse)
async def get_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Batch).options(joinedload(Batch.item)).filter(Batch.id == batch_id))
    batch = result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lot not found")
    batch.item_code = batch.item.code if batch.item else None
    batch.item_name = batch.item.name if batch.item else None
    return batch


@router.delete("/{batch_id}")
async def delete_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Batch).filter(Batch.id == batch_id))
    batch = result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lot not found")

    await db.delete(batch)
    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "DELETE", "Batch", str(batch_id),
        details=f"Deleted batch {batch.batch_number}"
    )
    return {"status": "success"}


@router.get("/{batch_id}/trace", response_model=BatchTraceResponse)
async def trace_batch_forward(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Forward traceability: raw material batch → finished goods batches produced with it."""
    batch_result = await db.execute(select(Batch).options(joinedload(Batch.item)).filter(Batch.id == batch_id))
    batch = batch_result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lot not found")
    batch.item_code = batch.item.code if batch.item else None
    batch.item_name = batch.item.name if batch.item else None

    consumptions_result = await db.execute(
        select(BatchConsumption).filter(BatchConsumption.input_batch_id == batch_id)
    )
    consumptions = consumptions_result.scalars().all()

    return BatchTraceResponse(
        batch=BatchResponse.model_validate(batch),
        consumptions=[BatchConsumptionResponse.model_validate(c) for c in consumptions],
    )


@router.get("/{batch_id}/trace-back", response_model=BatchTraceBackNode)
async def trace_batch_backward(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Backward genealogy: finished batch → input batches it was made from, recursively."""
    from app.models.manufacturing import ManufacturingOrder

    batch_result = await db.execute(select(Batch).options(joinedload(Batch.item)).filter(Batch.id == batch_id))
    batch = batch_result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lot not found")

    async def build_node(b: Batch, depth: int, visited: set) -> dict:
        b.item_code = b.item.code if b.item else None
        b.item_name = b.item.name if b.item else None
        node = {"batch": BatchResponse.model_validate(b), "inputs": []}
        if depth >= 8:
            return node
        cons_result = await db.execute(
            select(BatchConsumption).filter(BatchConsumption.output_batch_id == b.id)
        )
        for c in cons_result.scalars().all():
            key = str(c.input_batch_id)
            if key in visited:
                continue
            visited.add(key)
            in_result = await db.execute(select(Batch).options(joinedload(Batch.item)).filter(Batch.id == c.input_batch_id))
            in_batch = in_result.scalars().first()
            if not in_batch:
                continue
            child = await build_node(in_batch, depth + 1, visited)
            child["qty_consumed"] = float(c.qty_consumed)
            child["manufacturing_order_id"] = c.manufacturing_order_id
            mo_result = await db.execute(
                select(ManufacturingOrder.code).filter(ManufacturingOrder.id == c.manufacturing_order_id)
            )
            child["mo_code"] = mo_result.scalar()
            node["inputs"].append(child)
        return node

    return await build_node(batch, 0, {str(batch.id)})
