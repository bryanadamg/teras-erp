from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.db.session import get_async_db
from app.schemas import PurchaseOrderCreate, PurchaseOrderResponse, GoodsReceiptCreate, GoodsReceiptResponse
from app.models.purchase import PurchaseOrder, PurchaseOrderLine
from app.models.goods_receipt import GoodsReceipt, GoodsReceiptLine
from app.models.attribute import AttributeValue
from app.models.item import Item
from app.models.batch import Batch
from app.api.auth import get_current_user
from app.models.auth import User
from app.services import stock_service, audit_service
from datetime import datetime
import uuid

router = APIRouter(prefix="/purchase-orders", tags=["purchase"])


def _po_query():
    return (
        select(PurchaseOrder)
        .options(
            selectinload(PurchaseOrder.lines).selectinload(PurchaseOrderLine.attribute_values),
            selectinload(PurchaseOrder.receipts).selectinload(GoodsReceipt.lines).selectinload(GoodsReceiptLine.item),
        )
    )


@router.post("", response_model=PurchaseOrderResponse)
async def create_purchase_order(
    payload: PurchaseOrderCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(PurchaseOrder).filter(PurchaseOrder.po_number == payload.po_number))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="PO Number already exists")

    po = PurchaseOrder(
        po_number=payload.po_number,
        supplier_id=payload.supplier_id,
        target_location_id=payload.target_location_id,
        order_date=payload.order_date,
    )
    db.add(po)
    await db.flush()

    for line in payload.lines:
        db_line = PurchaseOrderLine(
            purchase_order_id=po.id,
            item_id=line.item_id,
            qty=line.qty,
            unit_price=line.unit_price,
            due_date=line.due_date,
        )
        if line.attribute_value_ids:
            attr_result = await db.execute(
                select(AttributeValue).filter(AttributeValue.id.in_(line.attribute_value_ids))
            )
            db_line.attribute_values = attr_result.scalars().all()
        db.add(db_line)

    await db.commit()

    final = await db.execute(_po_query().filter(PurchaseOrder.id == po.id))
    return final.scalars().first()


@router.post("/{po_id}/receipts", response_model=GoodsReceiptResponse)
async def create_goods_receipt(
    po_id: uuid.UUID,
    payload: GoodsReceiptCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines).selectinload(PurchaseOrderLine.attribute_values))
        .filter(PurchaseOrder.id == po_id)
    )
    po = result.scalars().first()
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    if po.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Cannot receive a cancelled PO")
    if not po.target_location_id:
        raise HTTPException(status_code=400, detail="Target location not set for this PO")

    line_map = {line.id: line for line in po.lines}

    gr = GoodsReceipt(
        po_id=po.id,
        receipt_date=payload.receipt_date or datetime.utcnow(),
        notes=payload.notes,
        created_by_id=current_user.id,
    )
    db.add(gr)
    await db.flush()

    # Lot enforcement: lot-tracked items must be received with a lot number
    line_item_ids = {line_map[rl.po_line_id].item_id for rl in payload.lines if rl.po_line_id in line_map}
    lt_res = await db.execute(select(Item.id).filter(Item.id.in_(line_item_ids), Item.lot_tracked == True))  # noqa: E712
    lot_tracked_ids = {str(i) for i in lt_res.scalars().all()}

    for rl in payload.lines:
        po_line = line_map.get(rl.po_line_id)
        if not po_line:
            raise HTTPException(status_code=400, detail=f"PO line {rl.po_line_id} not found on this PO")
        if rl.qty_received <= 0:
            raise HTTPException(status_code=400, detail="qty_received must be greater than 0")

        # Resolve supplier lot number to a batch (create if new)
        batch_id = rl.batch_id
        lot_no = (rl.batch_number or "").strip()
        if not batch_id and lot_no:
            existing = await db.execute(select(Batch).filter(Batch.batch_number == lot_no))
            b = existing.scalars().first()
            if b:
                if str(b.item_id) != str(po_line.item_id):
                    raise HTTPException(status_code=400, detail=f"Lot '{lot_no}' already belongs to a different item")
                batch_id = b.id
            else:
                b = Batch(batch_number=lot_no, item_id=po_line.item_id, created_by=current_user.username)
                db.add(b)
                await db.flush()
                batch_id = b.id
        if str(po_line.item_id) in lot_tracked_ids and not batch_id:
            raise HTTPException(status_code=400, detail="Item is lot-tracked — enter a lot number for this receipt line")

        gr_line = GoodsReceiptLine(
            receipt_id=gr.id,
            po_line_id=po_line.id,
            item_id=po_line.item_id,
            qty_received=rl.qty_received,
            qty_boxes=rl.qty_boxes,
            qty_cones=rl.qty_cones,
            qty_drums=rl.qty_drums,
            batch_id=batch_id,
        )
        db.add(gr_line)

        await stock_service.add_stock_entry(
            db,
            item_id=po_line.item_id,
            location_id=po.target_location_id,
            attribute_value_ids=[str(v.id) for v in po_line.attribute_values],
            qty_change=rl.qty_received,
            reference_type="Goods Receipt",
            reference_id=str(gr.id),
            batch_id=batch_id,
        )

        po_line.qty_received = (po_line.qty_received or 0) + rl.qty_received

    # Update PO status
    all_fulfilled = all(line.qty_received >= line.qty for line in po.lines)
    po.status = "RECEIVED" if all_fulfilled else "RECEIVING"

    await db.commit()

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="GoodsReceipt",
        entity_id=str(gr.id),
        details=f"Goods receipt for PO {po.po_number}",
    )

    final = await db.execute(
        select(GoodsReceipt)
        .options(selectinload(GoodsReceipt.lines).selectinload(GoodsReceiptLine.item))
        .filter(GoodsReceipt.id == gr.id)
    )
    return final.scalars().first()


@router.get("/{po_id}/receipts", response_model=list[GoodsReceiptResponse])
async def get_goods_receipts(
    po_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(GoodsReceipt)
        .options(selectinload(GoodsReceipt.lines).selectinload(GoodsReceiptLine.item))
        .filter(GoodsReceipt.po_id == po_id)
        .order_by(GoodsReceipt.receipt_date.desc())
    )
    return result.scalars().all()


@router.get("", response_model=list[PurchaseOrderResponse])
async def get_purchase_orders(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        _po_query().order_by(PurchaseOrder.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/{po_id}")
async def delete_purchase_order(
    po_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(PurchaseOrder).filter(PurchaseOrder.id == po_id))
    po = result.scalars().first()
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="DELETE",
        entity_type="purchase_order",
        entity_id=str(po.id),
        details=f"Deleted PO {po.po_number}",
    )
    await db.delete(po)
    await db.commit()
    return {"status": "success"}
