from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, aliased
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db, get_async_db
from app.services import kpi_service
from app.api.auth import get_current_user
from app.models.auth import User
from app.models.stock_balance import StockBalance
from app.models.stock_ledger import StockLedger
from app.models.item import Item
from app.models.location import Location
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.manufacturing import ManufacturingOrder

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/kpis")
def get_dashboard_kpis(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # You can choose to refresh if data is old, or just return cache
    return kpi_service.get_all_cached_kpis(db)

@router.get("/kpis/history")
def get_kpi_history(days: int = 30, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Daily KPI time series for trend charts: {key: [{date, value}, ...]}."""
    return kpi_service.get_kpi_history(db, days=days)


@router.get("/summary")
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Server-side computation of the dashboard's heavy aggregates.

    Replaces the previous frontend approach of shipping the entire stock-balance
    table and all sales orders to the browser. Uses SQL aggregation throughout.
    """
    # --- Warehouse distribution: sum qty per location (qty > 0 only), grouped by
    #     the location's parent warehouse (spots roll up to their warehouse) ---
    Warehouse = aliased(Location)
    wd_result = await db.execute(
        select(
            StockBalance.location_id,
            Location.name,
            Location.parent_id,
            Warehouse.name.label("warehouse_name"),
            func.sum(StockBalance.qty).label("total_qty"),
        )
        .join(Location, Location.id == StockBalance.location_id)
        .outerjoin(Warehouse, Warehouse.id == Location.parent_id)
        .group_by(StockBalance.location_id, Location.name, Location.parent_id, Warehouse.name)
        .having(func.sum(StockBalance.qty) > 0)
        .order_by(func.sum(StockBalance.qty).desc())
    )
    warehouse_distribution = [
        {
            "location_id": str(row.location_id),
            "location_name": row.name,
            # keys kept for the dashboard's grouped display; now carry the parent warehouse
            "location_category_id": str(row.parent_id) if row.parent_id else None,
            "location_category_name": row.warehouse_name or "No Warehouse",
            "total_qty": float(row.total_qty or 0),
        }
        for row in wd_result.all()
    ]

    # --- Low stock items: items WITH a StockBalance row whose summed qty is
    #     below the item's reorder point (Item.min_stock_level, default 10).
    #     Ordered most-deficient first. ---
    ls_result = await db.execute(
        select(
            StockBalance.item_id,
            Item.name,
            Item.code,
            func.coalesce(Item.min_stock_level, 10).label("min_level"),
            func.sum(StockBalance.qty).label("total_qty"),
        )
        .join(Item, Item.id == StockBalance.item_id)
        .group_by(StockBalance.item_id, Item.name, Item.code, Item.min_stock_level)
        .having(func.sum(StockBalance.qty) < func.coalesce(Item.min_stock_level, 10))
        .order_by((func.sum(StockBalance.qty) - func.coalesce(Item.min_stock_level, 10)).asc())
        .limit(10)
    )
    low_stock_items = [
        {
            "item_id": str(row.item_id),
            "item_name": row.name,
            "item_code": row.code,
            "min_level": float(row.min_level or 0),
            "total_qty": float(row.total_qty or 0),
        }
        for row in ls_result.all()
    ]

    # --- Recent movements: last 5 ledger rows, resolve item + location names ---
    rm_result = await db.execute(
        select(
            StockLedger.item_id,
            StockLedger.qty_change,
            StockLedger.created_at,
            Item.name.label("item_name"),
            Location.name.label("location_name"),
        )
        .outerjoin(Item, Item.id == StockLedger.item_id)
        .outerjoin(Location, Location.id == StockLedger.location_id)
        .order_by(StockLedger.created_at.desc())
        .limit(5)
    )
    recent_movements = [
        {
            "item_id": str(row.item_id),
            "item_name": row.item_name or str(row.item_id),
            "location_name": row.location_name or "",
            "qty_change": float(row.qty_change or 0),
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rm_result.all()
    ]

    # --- Sales orders: readiness/shortage analysis over open (PENDING) SOs ---
    open_so_result = await db.execute(
        select(SalesOrder)
        .where(SalesOrder.status == "PENDING")
    )
    open_sos = open_so_result.scalars().all()
    open_so_count = len(open_sos)

    # Lines for all open SOs (one query)
    so_ids = [so.id for so in open_sos]
    lines_by_so: dict = {}
    needed_item_ids: set = set()
    if so_ids:
        lines_result = await db.execute(
            select(SalesOrderLine).where(SalesOrderLine.sales_order_id.in_(so_ids))
        )
        for line in lines_result.scalars().all():
            lines_by_so.setdefault(line.sales_order_id, []).append(line)
            needed_item_ids.add(line.item_id)

    # Available stock per item across all locations/variants (one aggregated query)
    avail_by_item: dict = {}
    if needed_item_ids:
        avail_result = await db.execute(
            select(StockBalance.item_id, func.sum(StockBalance.qty))
            .where(StockBalance.item_id.in_(needed_item_ids))
            .group_by(StockBalance.item_id)
        )
        avail_by_item = {row[0]: float(row[1] or 0) for row in avail_result.all()}

    ready_so_count = 0
    short_so_count = 0
    short_orders: list = []
    for so in open_sos:
        lines = lines_by_so.get(so.id, [])
        if not lines:
            continue
        short_lines = 0
        for line in lines:
            available = avail_by_item.get(line.item_id, 0.0)
            if available < float(line.qty):
                short_lines += 1
        if short_lines == 0:
            ready_so_count += 1
        else:
            short_so_count += 1
            if len(short_orders) < 5:
                short_orders.append({
                    "code": so.po_number,
                    "short_lines": short_lines,
                    "total_lines": len(lines),
                })

    delivery_readiness = (ready_so_count / open_so_count * 100) if open_so_count > 0 else 100.0

    # --- Production yield: over ManufacturingOrder (same model as active_wo/pending_wo) ---
    py_result = await db.execute(
        select(ManufacturingOrder.status, ManufacturingOrder.qty)
        .where(ManufacturingOrder.status.in_(["COMPLETED", "IN_PROGRESS"]))
    )
    completed_qty = 0.0
    total_started_qty = 0.0
    for row in py_result.all():
        q = float(row.qty or 0)
        total_started_qty += q
        if row.status == "COMPLETED":
            completed_qty += q
    production_yield = (completed_qty / total_started_qty * 100) if total_started_qty > 0 else 100.0

    return {
        "warehouse_distribution": warehouse_distribution,
        "low_stock_items": low_stock_items,
        "recent_movements": recent_movements,
        "open_so_count": open_so_count,
        "ready_so_count": ready_so_count,
        "short_so_count": short_so_count,
        "delivery_readiness": float(delivery_readiness),
        "short_orders": short_orders,
        "production_yield": float(production_yield),
    }
