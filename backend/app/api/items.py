import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from asyncpg.exceptions import ForeignKeyViolationError
from app.db.session import get_async_db
from app.services import item_service, stock_service, import_service, audit_service
from app.schemas import ItemCreate, ItemResponse, StockEntryCreate, ItemUpdate, VariantCreate, PaginatedItemResponse
from app.models.location import Location
from app.models.auth import User
from app.api.auth import get_current_user, require_permission
from sqlalchemy import select
from app.core.ws_manager import manager
from app.services import kpi_service

router = APIRouter()


@router.get("/items/lookup")
async def get_items_lookup(db: AsyncSession = Depends(get_async_db), current_user: User = Depends(get_current_user)):
    """Lightweight id/code/name list of ALL items.

    Declared BEFORE any dynamic GET /items/{item_id} route so 'lookup' is not
    captured as an item_id path param. Columns only — no eager loads, no pagination.
    """
    from app.models.item import Item
    result = await db.execute(select(Item.id, Item.code, Item.name))
    return [
        {"id": str(row.id), "name": row.name, "code": row.code}
        for row in result.all()
    ]


def _populate_source_info(item) -> None:
    item.attribute_ids = [a.id for a in item.attributes]
    item.source_sample_code = item.source_sample.code if item.source_sample else None
    item.source_color_name = item.source_color.name if item.source_color else None
    item.category_path = item.category.path_names if item.category else []
    item.packaging_factor_ids = [f.id for f in item.packaging_factors]


@router.post("/items", response_model=ItemResponse)
async def create_item_api(payload: ItemCreate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('inventory.manage'))):
    db_item = await item_service.get_item_by_code(db, code=payload.code)
    if db_item:
        raise HTTPException(status_code=400, detail="Item already exists")
    
    item = await item_service.create_item(
        db,
        code=payload.code,
        name=payload.name,
        uom=payload.uom,
        category_id=payload.category_id,
        source_sample_id=payload.source_sample_id,
        source_color_id=payload.source_color_id,
        attribute_ids=payload.attribute_ids,
        weight_per_unit=payload.weight_per_unit,
        weight_unit=payload.weight_unit,
        packaging_factor_ids=[str(fid) for fid in payload.packaging_factor_ids],
        ends=payload.ends,
        lot_tracked=payload.lot_tracked,
        min_stock_level=payload.min_stock_level,
        default_source_location_id=payload.default_source_location_id,
    )

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="Item",
        entity_id=str(item.id),
        details=f"Created item {item.code} ({item.name})",
        changes=payload.model_dump()
    )

    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    _populate_source_info(item)
    return item

@router.get("/items", response_model=PaginatedItemResponse)
async def get_items_api(
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
    category_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    items, total = await item_service.get_items(db, skip=skip, limit=limit, user=current_user, search=search, category_id=category_id)
    for item in items:
        _populate_source_info(item)

    return {
        "items": items,
        "total": total,
        "page": (skip // limit) + 1,
        "size": len(items)
    }

@router.put("/items/{item_id}", response_model=ItemResponse)
async def update_item_api(item_id: str, payload: ItemUpdate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('inventory.manage'))):
    item = await item_service.update_item(db, item_id, payload.model_dump(exclude_unset=True))
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    _populate_source_info(item)

    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="Item",
        entity_id=item_id,
        details=f"Updated item {item.code}",
        changes=payload.model_dump(exclude_unset=True)
    )
    
    return item

@router.post("/items/stock")
async def add_stock_api(payload: StockEntryCreate, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('stock.entry'))):
    # Resolve Item
    item = await item_service.get_item_by_code(db, payload.item_code)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Resolve Location
    result = await db.execute(select(Location).filter(Location.code == payload.location_code))
    location = result.scalars().first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    # Validate Attribute Values if provided
    if payload.attribute_value_ids:
        from app.models.attribute import AttributeValue
        valid_attr_ids = [a.id for a in item.attributes]
        
        for val_id in payload.attribute_value_ids:
            result = await db.execute(select(AttributeValue).filter(AttributeValue.id == val_id))
            val = result.scalars().first()
            if not val or val.attribute_id not in valid_attr_ids:
                 raise HTTPException(status_code=400, detail=f"Invalid attribute value {val_id} for this item")

    await stock_service.add_stock_entry(
        db,
        item_id=item.id,
        location_id=location.id,
        attribute_value_ids=[str(vid) for vid in payload.attribute_value_ids],
        qty_change=payload.qty,
        reference_type="manual",
        reference_id="manual_entry",
        cones_change=payload.qty_cones or 0,
        boxes_change=payload.qty_boxes or 0,
        drums_change=payload.qty_drums or 0,
    )
    
    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="StockEntry",
        entity_id=item.code, 
        details=f"Manual stock adjustment: {payload.qty} for {item.code} at {location.name}",
        changes=payload.model_dump()
    )
    
    return {"status": "success", "message": "Stock recorded"}

@router.get("/items/template")
async def get_items_template(current_user: User = Depends(get_current_user)):
    # Keep as sync if generating CSV doesn't need DB or use run_in_threadpool
    content = import_service.generate_items_template()
    return Response(content=content, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=items_template.csv"})

@router.post("/items/import")
async def import_items(file: UploadFile = File(...), db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('inventory.manage'))):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a CSV.")
    
    content = await file.read()
    results = await import_service.import_items_csv(db, content)
    
    if results["errors"]:
        return {"status": "partial_success", "imported": results["success"], "errors": results["errors"]}
    
    return {"status": "success", "imported": results["success"]}

@router.delete("/items/{item_id}")
async def delete_item(item_id: str, db: AsyncSession = Depends(get_async_db), current_user: User = Depends(require_permission('inventory.delete'))):
    from app.models.item import Item
    result = await db.execute(select(Item).filter(Item.id == item_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    item_code = item.code
    item_name = item.name
    details = f"Deleted item {item_code} ({item_name})"

    try:
        await db.delete(item)
        await db.commit()
    except (IntegrityError, ForeignKeyViolationError):
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete item {item_code} because it is still referenced by a BOM or other record."
        )
    
    await audit_service.log_activity(
        db,
        user_id=current_user.id,
        action="DELETE",
        entity_type="Item",
        entity_id=item_id,
        details=details
    )

    try:
        await kpi_service.invalidate_kpis_async(db)
        await manager.broadcast({"type": "KPI_UPDATE"})
    except Exception:
        pass

    return {"status": "success", "message": "Item deleted"}
