from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from app.db.session import get_async_db
from app.schemas import SalesOrderCreate, SalesOrderUpdate, SalesOrderResponse
from app.models.sales import SalesOrder, SalesOrderLine, sales_order_line_values
from app.models.attribute import AttributeValue
from app.api.auth import get_current_user
from app.models.auth import User
from app.services import audit_service
from datetime import datetime
import uuid

router = APIRouter(prefix="/sales-orders", tags=["sales"])

@router.post("", response_model=SalesOrderResponse)
async def create_sales_order(payload: SalesOrderCreate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    try:
        # Check duplicate PO
        result = await db.execute(select(SalesOrder).filter(SalesOrder.po_number == payload.po_number))
        if result.scalars().first():
            raise HTTPException(status_code=400, detail=f"PO Number '{payload.po_number}' already exists")

        so = SalesOrder(
            po_number=payload.po_number,
            customer_po_ref=payload.customer_po_ref,
            customer_name=payload.customer_name,
            order_date=payload.order_date or datetime.utcnow()
        )
        db.add(so)
        await db.flush() # Get ID

        for line in payload.lines:
            db_line = SalesOrderLine(
                sales_order_id=so.id,
                item_id=line.item_id,
                qty=line.qty,
                due_date=line.due_date,
                internal_confirmation_date=line.internal_confirmation_date,
                ket_stock=line.ket_stock,
                qty_kg=line.qty_kg,
                qty2=line.qty2,
                uom2=line.uom2,
                uom2_factor=line.uom2_factor,
                bom_size_id=line.bom_size_id,
            )
            if line.attribute_value_ids:
                attr_result = await db.execute(select(AttributeValue).filter(AttributeValue.id.in_(line.attribute_value_ids)))
                db_line.attribute_values = attr_result.scalars().all()
            db.add(db_line)
        
        await db.commit()
    except HTTPException:
        raise
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Database integrity error (duplicate reference or invalid ID)")
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    
    # Refresh with eager loading
    final_result = await db.execute(
        select(SalesOrder)
        .options(
            selectinload(SalesOrder.lines).selectinload(SalesOrderLine.attribute_values),
            selectinload(SalesOrder.lines).selectinload(SalesOrderLine.item),
        )
        .filter(SalesOrder.id == so.id)
    )
    so_refreshed = final_result.scalars().first()

    for line in so_refreshed.lines:
        line.attribute_value_ids = [v.id for v in line.attribute_values]
        if line.item:
            line.item_name = line.item.name
            line.item_code = line.item.code

    return so_refreshed

@router.get("", response_model=list[SalesOrderResponse])
async def get_sales_orders(db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(SalesOrder)
        .options(
            selectinload(SalesOrder.lines).selectinload(SalesOrderLine.attribute_values),
            selectinload(SalesOrder.lines).selectinload(SalesOrderLine.item),
        )
        .order_by(SalesOrder.created_at.desc())
    )
    orders = result.scalars().all()

    for so in orders:
        for line in so.lines:
            line.attribute_value_ids = [v.id for v in line.attribute_values]
            if line.item:
                line.item_name = line.item.name
                line.item_code = line.item.code

    return orders

@router.put("/{so_id}", response_model=SalesOrderResponse)
async def update_sales_order(so_id: uuid.UUID, payload: SalesOrderUpdate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(SalesOrder).filter(SalesOrder.id == so_id))
    so = result.scalars().first()
    if not so:
        raise HTTPException(status_code=404, detail="SO not found")

    if so.status not in ["PENDING", "READY"]:
        raise HTTPException(status_code=400, detail=f"Cannot edit SO with status '{so.status}'")

    if payload.po_number != so.po_number:
        dup = await db.execute(select(SalesOrder).filter(SalesOrder.po_number == payload.po_number))
        if dup.scalars().first():
            raise HTTPException(status_code=400, detail=f"PO Number '{payload.po_number}' already exists")

    so.po_number = payload.po_number
    so.customer_po_ref = payload.customer_po_ref
    so.customer_name = payload.customer_name
    so.order_date = payload.order_date or so.order_date
    so.notes = payload.notes

    line_ids_result = await db.execute(
        select(SalesOrderLine.id).where(SalesOrderLine.sales_order_id == so_id)
    )
    line_ids = line_ids_result.scalars().all()
    if line_ids:
        await db.execute(sa_delete(sales_order_line_values).where(
            sales_order_line_values.c.sales_order_line_id.in_(line_ids)
        ))
    await db.execute(sa_delete(SalesOrderLine).where(SalesOrderLine.sales_order_id == so_id))
    await db.flush()

    for line in payload.lines:
        db_line = SalesOrderLine(
            sales_order_id=so.id,
            item_id=line.item_id,
            qty=line.qty,
            due_date=line.due_date,
            internal_confirmation_date=line.internal_confirmation_date,
            ket_stock=line.ket_stock,
            qty_kg=line.qty_kg,
            qty2=line.qty2,
            uom2=line.uom2,
            uom2_factor=line.uom2_factor,
            bom_size_id=line.bom_size_id,
        )
        if line.attribute_value_ids:
            attr_result = await db.execute(select(AttributeValue).filter(AttributeValue.id.in_(line.attribute_value_ids)))
            db_line.attribute_values = attr_result.scalars().all()
        db.add(db_line)

    await db.commit()

    final_result = await db.execute(
        select(SalesOrder)
        .options(
            selectinload(SalesOrder.lines).selectinload(SalesOrderLine.attribute_values),
            selectinload(SalesOrder.lines).selectinload(SalesOrderLine.item),
        )
        .filter(SalesOrder.id == so.id)
    )
    so_refreshed = final_result.scalars().first()

    for line in so_refreshed.lines:
        line.attribute_value_ids = [v.id for v in line.attribute_values]
        if line.item:
            line.item_name = line.item.name
            line.item_code = line.item.code

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="SalesOrder",
        entity_id=str(so.id),
        details=f"Updated SO {so_refreshed.po_number}"
    )

    return so_refreshed

@router.put("/{so_id}/status", response_model=SalesOrderResponse)
async def update_sales_order_status(so_id: uuid.UUID, status: str, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(SalesOrder)
        .options(
            selectinload(SalesOrder.lines).selectinload(SalesOrderLine.attribute_values),
            selectinload(SalesOrder.lines).selectinload(SalesOrderLine.item),
        )
        .filter(SalesOrder.id == so_id)
    )
    so = result.scalars().first()
    if not so:
        raise HTTPException(status_code=404, detail="SO not found")

    prev_status = so.status
    valid_statuses = ["PENDING", "READY", "SENT", "DELIVERED", "CANCELLED"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    so.status = status
    if status == "DELIVERED":
        so.delivered_at = datetime.utcnow()

    await db.commit()

    for line in so.lines:
        line.attribute_value_ids = [v.id for v in line.attribute_values]
        if line.item:
            line.item_name = line.item.name
            line.item_code = line.item.code
    
    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="STATUS_CHANGE",
        entity_type="SalesOrder",
        entity_id=str(so.id),
        details=f"Status: {prev_status} -> {status}"
    )
    
    return so

@router.delete("/{so_id}")
async def delete_sales_order(so_id: uuid.UUID, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(SalesOrder).filter(SalesOrder.id == so_id))
    so = result.scalars().first()
    if not so:
        raise HTTPException(status_code=404, detail="SO not found")
    
    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="DELETE",
        entity_type="sales_order",
        entity_id=str(so.id),
        details=f"Deleted SO {so.po_number}"
    )
    await db.delete(so)
    await db.commit()
    return {"status": "success"}
