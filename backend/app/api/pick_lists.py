from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, String
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import datetime
import uuid

from app.db.session import get_async_db
from app.schemas import (
    PickListCreate, PickListUpdate, PickListResponse, PickListListResponse,
    PickListScanPayload, PickableOrderResponse,
)
from app.models.pick_list import PickList, PickListLine
from app.models.batch import Batch
from app.models.sales import SalesOrder, SalesOrderLine
from app.api.auth import get_current_user, require_permission, require_any_permission
from app.models.auth import User
from app.services import (
    audit_service, kpi_service, stock_service, packing_service, so_fulfilment_service,
    numbering_service,
)
from app.core.ws_manager import manager
from app.core.pagination import PageParams, PageWindow

router = APIRouter(prefix="/pick-lists", tags=["pick-lists"])


# --- helpers ---------------------------------------------------------------

def _load_options():
    # sales_order is loaded plain (no .lines) — _decorate() only reads po_number/
    # customer_name, both columns on SalesOrder itself. dispatch_pick_list is the
    # one place that needs sales_order.lines, and it already runs its own dedicated
    # query for it; loading it here on every list/detail fetch was two pure-waste
    # queries that scale with SO line count for zero benefit.
    # The SO line hop is for the Surat Jalan: the doc prints a WARNA column, and the
    # ordered shade lives on the SO line (color_id -> Color, plus the legacy variant
    # attribute values), never on the pick list line itself.
    return (
        selectinload(PickList.sales_order),
        selectinload(PickList.lines).selectinload(PickListLine.item),
        selectinload(PickList.lines).selectinload(PickListLine.batch),
        selectinload(PickList.lines).selectinload(PickListLine.sales_order_line).selectinload(SalesOrderLine.color),
        selectinload(PickList.lines).selectinload(PickListLine.sales_order_line).selectinload(SalesOrderLine.attribute_values),
        selectinload(PickList.shipment),
    )


async def _load(db: AsyncSession, pl_id) -> Optional[PickList]:
    # Session uses expire_on_commit=False, so an instance already in the identity
    # map keeps its previously-loaded (now stale) collections. Expire first so the
    # selectinload below repopulates lines with fresh post-commit rows.
    db.expire_all()
    result = await db.execute(
        select(PickList).options(*_load_options()).filter(PickList.id == pl_id)
    )
    return result.scalars().first()


def _decorate(pl: PickList) -> PickList:
    """Attach non-column display fields the response schema expects."""
    if pl.sales_order:
        pl.sales_order_code = pl.sales_order.po_number
        pl.customer_name = pl.sales_order.customer_name
        # The customer's own PO — the "NO PO" column of the Surat Jalan. Their
        # reference, not ours; po_number is the internal SO code.
        pl.customer_po_ref = pl.sales_order.customer_po_ref
    # Which loading-deck handover this pick list is on, if any. The page shows it
    # so a picker can see their work has moved on rather than gone missing.
    if pl.shipment:
        pl.shipment_code = pl.shipment.code
        pl.shipment_status = pl.shipment.status
    for line in (pl.lines or []):
        sol = line.sales_order_line
        color = sol.color if sol else None
        line.color_name = color.name if color else None
        # Customers reference their own shade code on the delivery note when they
        # have one; ours is the fallback.
        line.color_code = (color.customer_color_code or color.code) if color else None
        line.attribute_value_ids = [v.id for v in (sol.attribute_values or [])] if sol else []
    return pl


async def _next_code(db: AsyncSession) -> str:
    """Next `PL-NNNNN` off the pick-list number range.

    max(code)+1 raced two concurrent creates onto the same code. Seeded once from
    the highest existing number — legacy rows carry the old `PK-` prefix from when
    this table was packing_orders, so both are read or numbering would restart at 1
    and collide."""
    async def _seed() -> int:
        # func.max() on the code column is a STRING max, so a code not zero-padded
        # to the current width can outrank the real numeric max (e.g. "PL-003" >
        # "PL-00144" lexicographically). Parse every candidate, take the numeric max.
        codes = (await db.execute(select(PickList.code))).scalars().all()
        best = 0
        for c in codes:
            if c and c[:3] in ("PL-", "PK-"):
                try:
                    best = max(best, int(c.split("-", 1)[1]))
                except (ValueError, IndexError):
                    continue
        return best

    async def _taken(code: str) -> bool:
        return (await db.execute(
            select(PickList.id).filter(PickList.code == code).limit(1)
        )).scalars().first() is not None

    _, code = await numbering_service.allocate_code(
        db, "PICK_LIST", lambda n: f"PL-{n:05d}", seed=_seed, exists=_taken,
    )
    return code


async def _remaining_by_so_line(db: AsyncSession, so: SalesOrder, exclude_pl_id=None) -> dict:
    """qty remaining to ship per SO line = ordered - already picked (non-cancelled).

    exclude_pl_id drops one pick list's own lines from the "picked" sum — used
    when editing a DRAFT so it doesn't count its own not-yet-saved allocation
    against itself.
    """
    query = (
        select(PickListLine.sales_order_line_id, func.coalesce(func.sum(PickListLine.qty_picked), 0))
        .join(PickList, PickListLine.pick_list_id == PickList.id)
        .filter(PickList.sales_order_id == so.id, PickList.status != "CANCELLED")
        .group_by(PickListLine.sales_order_line_id)
    )
    if exclude_pl_id:
        query = query.filter(PickList.id != exclude_pl_id)
    picked = await db.execute(query)
    picked_map = {str(sol_id): float(qty) for sol_id, qty in picked.all()}
    return {
        str(line.id): max(0.0, float(line.qty) - picked_map.get(str(line.id), 0.0))
        for line in so.lines
    }


async def _suggest_lines(db: AsyncSession, pl: PickList, so: SalesOrder) -> list[PickListLine]:
    """Seed a pick list with whole cartons, FIFO, for every outstanding SO line.

    Carton-only by design: a pick list is downstream of packing, so a line with
    nothing packed yet simply isn't seeded — it comes onto a later pick list once
    its cartons exist. (This replaced a bulk-qty fallback that let un-cartonised
    stock ship straight off a pick list, which put goods on a Surat Jalan that no
    physical box backed and left the carton genealogy with a hole.)
    """
    remaining = await _remaining_by_so_line(db, so)
    taken = await packing_service.allocated_unit_ids(db)
    lines: list[PickListLine] = []

    for so_line in so.lines:
        rem = remaining.get(str(so_line.id), 0.0)
        if rem <= 0:
            continue
        attr_ids = [str(v.id) for v in (so_line.attribute_values or [])]
        units = await packing_service.suggest_units_for_line(
            db, so_line.item_id, rem,
            location_id=pl.source_location_id,
            attribute_value_ids=attr_ids,
            color_id=so_line.color_id,
            exclude_ids=taken,
        )
        for pu, qty in units:
            taken.add(pu.id)
            loc = await _unit_location(db, pu)
            lines.append(PickListLine(
                pick_list_id=pl.id,
                sales_order_line_id=so_line.id,
                item_id=so_line.item_id,
                qty_picked=qty,
                source_location_id=loc,
                batch_id=pu.id,
            ))
    return lines


async def _ready_carton_index(db: AsyncSession) -> dict:
    """Every unallocated, in-stock carton keyed by (item_id, variant_key), FIFO.

    One query for the whole plant instead of per-SO-line lookups: the readiness
    board scores every open order at once, and a per-line query there is an N+1
    that grows with the order book.
    """
    from app.models.stock_balance import StockBalance
    taken = await packing_service.allocated_unit_ids(db)
    rows = (await db.execute(
        select(Batch, StockBalance)
        .join(StockBalance, StockBalance.batch_key == cast(Batch.id, String))
        .filter(
            packing_service.packed_unit_filter(),
            Batch.quality_status == "GOOD",
            StockBalance.qty > 0,
        )
        .order_by(Batch.created_at.asc(), Batch.package_no.asc())
    )).all()

    index: dict = {}
    seen = set()
    for batch, bal in rows:
        # A carton is atomic; a stray second balance row must not double-count it.
        if batch.id in seen or batch.id in taken:
            continue
        seen.add(batch.id)
        index.setdefault((str(batch.item_id), bal.variant_key), []).append(float(bal.qty))
    return index


def _so_due_date(so: SalesOrder):
    """Earliest line due date — when the customer expects the order."""
    dues = [l.due_date for l in (so.lines or []) if l.due_date]
    return min(dues) if dues else None


async def _unit_location(db: AsyncSession, pu: Batch):
    """Where a carton physically is — the location of its (single) balance row."""
    from app.models.stock_balance import StockBalance
    result = await db.execute(
        select(StockBalance.location_id)
        .filter(StockBalance.batch_key == str(pu.id), StockBalance.qty > 0)
        .limit(1)
    )
    return result.scalar()


# --- routes ----------------------------------------------------------------

@router.get("", response_model=PickListListResponse)
async def list_pick_lists(
    status: Optional[str] = None,
    sales_order_id: Optional[uuid.UUID] = None,
    window: PageWindow = Depends(PageParams(default_size=100)),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    query = select(PickList).options(*_load_options())
    count_query = select(func.count(PickList.id))
    if status:
        query = query.filter(PickList.status == status)
        count_query = count_query.filter(PickList.status == status)
    if sales_order_id:
        query = query.filter(PickList.sales_order_id == sales_order_id)
        count_query = count_query.filter(PickList.sales_order_id == sales_order_id)

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(window.apply(query.order_by(PickList.created_at.desc())))
    orders = result.scalars().all()
    for pl in orders:
        _decorate(pl)
    return window.envelope(orders, total)


@router.get("/pickable-orders", response_model=list[PickableOrderResponse])
async def list_pickable_orders(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Open sales orders scored for picking: soonest delivery first, showing what
    is actually packed and waiting for each.

    Declared above `/{pl_id}` on purpose — FastAPI matches in declaration order,
    and "pickable-orders" would otherwise be parsed as a pick list UUID.

    Cartons are claimed by the most urgent order first. They are not reserved —
    any pick list may still take any carton — but scoring them in due-date order
    is the only reading that doesn't promise the same physical box to two orders
    at once on this board.
    """
    so_rows = (await db.execute(
        select(SalesOrder)
        .options(selectinload(SalesOrder.lines).selectinload(SalesOrderLine.attribute_values))
        .filter(SalesOrder.status.in_(["PENDING", "READY", "PARTIAL"]))
    )).scalars().all()

    draft_so_ids = {
        str(r[0]) for r in (await db.execute(
            select(PickList.sales_order_id).filter(PickList.status.in_(["DRAFT", "PICKING", "PICKED"]))
        )).all() if r[0]
    }

    index = await _ready_carton_index(db)
    today = datetime.utcnow().date()

    # Urgent first, undated orders last — an order with no due date is not more
    # urgent than every dated one, which is what plain ascending sort would say.
    ordered = sorted(so_rows, key=lambda s: (_so_due_date(s) is None, _so_due_date(s) or datetime.max))

    out: list[PickableOrderResponse] = []
    for so in ordered:
        remaining = await _remaining_by_so_line(db, so)
        qty_outstanding = 0.0
        qty_ready = 0.0
        cartons_ready = 0
        lines_outstanding = 0
        for line in so.lines:
            rem = remaining.get(str(line.id), 0.0)
            if rem <= 0:
                continue
            lines_outstanding += 1
            qty_outstanding += rem
            attr_ids = [str(v.id) for v in (line.attribute_values or [])]
            key = (str(line.item_id), stock_service._generate_variant_key(attr_ids, line.color_id))
            pool = index.get(key)
            if not pool:
                continue
            # Whole cartons only — the picker moves a physical box, so the last
            # one may overshoot the outstanding qty rather than be split.
            covered = 0.0
            while pool and covered < rem - 1e-6:
                covered += pool.pop(0)
                cartons_ready += 1
            qty_ready += covered

        if qty_outstanding <= 0:
            continue
        due = _so_due_date(so)
        out.append(PickableOrderResponse(
            id=so.id,
            po_number=so.po_number,
            customer_po_ref=so.customer_po_ref,
            customer_name=so.customer_name,
            status=so.status,
            due_date=due,
            days_to_due=(due.date() - today).days if due else None,
            line_count=len(so.lines or []),
            lines_outstanding=lines_outstanding,
            qty_outstanding=round(qty_outstanding, 4),
            qty_ready=round(qty_ready, 4),
            cartons_ready=cartons_ready,
            has_open_pick_list=str(so.id) in draft_so_ids,
        ))
    return out


@router.get("/resolve", response_model=PickListResponse)
async def resolve_pick_list(
    code: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Scanner lookup: PL-NNNNN -> the pick list it names.

    Declared above `/{pl_id}` for the same reason as `/pickable-orders` — the
    path would otherwise be parsed as a pick list UUID.

    Case-insensitive because the floor types codes by hand when a label is
    scuffed. Legacy `PK-` rows resolve too: they are the same table.
    """
    wanted = (code or "").strip()
    if not wanted:
        raise HTTPException(status_code=404, detail="No code given")
    result = await db.execute(
        select(PickList).options(*_load_options()).filter(func.upper(PickList.code) == wanted.upper())
    )
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail=f"No pick list found for '{wanted}'")
    return _decorate(pl)


@router.get("/{pl_id}", response_model=PickListResponse)
async def get_pick_list(
    pl_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    pl = await _load(db, pl_id)
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
    return _decorate(pl)


@router.get("/{pl_id}/remaining")
async def get_remaining_for_pick_list(
    pl_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Per-SO-line qty still available to allocate to this DRAFT, excluding its own
    lines. Lets the editor compute remaining/over-pick without loading every pick
    list in the system to sum qty_picked client-side."""
    pl_result = await db.execute(select(PickList).filter(PickList.id == pl_id))
    pl = pl_result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
    so_result = await db.execute(
        select(SalesOrder).options(selectinload(SalesOrder.lines)).filter(SalesOrder.id == pl.sales_order_id)
    )
    so = so_result.scalars().first()
    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")
    return await _remaining_by_so_line(db, so, exclude_pl_id=pl_id)


@router.post("", response_model=PickListResponse)
async def create_pick_list(
    payload: PickListCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    so_result = await db.execute(
        select(SalesOrder)
        .options(selectinload(SalesOrder.lines).selectinload(SalesOrderLine.attribute_values))
        .filter(SalesOrder.id == payload.sales_order_id)
    )
    so = so_result.scalars().first()
    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")
    # Allow picking partially-produced orders: ship whatever finished stock exists
    # now, even before the whole order target is met. Stock availability (enforced
    # at dispatch) is the real guard, not SO completion status.
    if so.status in ("SENT", "DELIVERED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"Cannot pick a {so.status} order")

    # Packing comes first: a pick list picks cartons, so there is nothing to pick
    # until a packing order has minted some. Checked before the pick list row is
    # written so an order with nothing packed never leaves an empty DRAFT behind.
    remaining_now = await _remaining_by_so_line(db, so)
    taken_now = await packing_service.allocated_unit_ids(db)
    has_cartons = False
    for so_line in so.lines:
        if remaining_now.get(str(so_line.id), 0.0) <= 0:
            continue
        units = await packing_service.available_packed_units(
            db, so_line.item_id,
            location_id=payload.source_location_id,
            attribute_value_ids=[str(v.id) for v in (so_line.attribute_values or [])],
            color_id=so_line.color_id,
            exclude_ids=taken_now,
            # No limit=1: available_packed_units applies the SQL limit before
            # filtering exclude_ids, so a low limit full of already-allocated
            # cartons would read as "nothing packed".
        )
        if units:
            has_cartons = True
            break
    if not has_cartons:
        raise HTTPException(
            status_code=400,
            detail=(
                "Nothing packed for this order yet — create a packing order and log "
                "cartons against it before picking."
            ),
        )

    code = await _next_code(db)
    pl = PickList(
        code=code,
        sales_order_id=so.id,
        source_location_id=payload.source_location_id,
        status="DRAFT",
        created_by_id=current_user.id,
    )
    db.add(pl)
    await db.flush()

    if payload.lines:
        for l in payload.lines:
            db.add(PickListLine(
                pick_list_id=pl.id,
                sales_order_line_id=l.sales_order_line_id,
                item_id=l.item_id,
                qty_picked=l.qty_picked,
                source_location_id=l.source_location_id,
                batch_id=l.batch_id,
            ))
    else:
        for line in await _suggest_lines(db, pl, so):
            db.add(line)

    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="CREATE", entity_type="PickList",
        entity_id=str(pl.id), details=f"Created pick list {code} for SO {so.po_number}",
    )
    try:
        await manager.broadcast({"type": "PICK_LIST_UPDATE", "id": str(pl.id)})
    except Exception:
        pass

    pl = await _load(db, pl.id)
    return _decorate(pl)


@router.put("/{pl_id}", response_model=PickListResponse)
async def update_pick_list(
    pl_id: uuid.UUID,
    payload: PickListUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    pl = await _load(db, pl_id)
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
    if pl.status in ("DISPATCHED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"Cannot edit a {pl.status} pick list")
    # Once loaded onto a shipment the contents are what a checker is counting
    # against a printed note — take it off the shipment first.
    if pl.shipment_id:
        raise HTTPException(
            status_code=400,
            detail=f"Pick list is staged on shipment {pl.shipment.code if pl.shipment else ''} — unload it there first",
        )

    # Scalar header fields. Surat Jalan fields are absent by design: they live on
    # the Shipment now (see models/shipment.py).
    for field in ("source_location_id", "status", "notes"):
        val = getattr(payload, field)
        if val is not None:
            setattr(pl, field, val)

    if payload.qc_passed is not None:
        pl.qc_passed = payload.qc_passed
        if payload.qc_passed:
            pl.qc_at = datetime.utcnow()
            pl.qc_inspector = payload.qc_inspector
        else:
            pl.qc_at = None
            pl.qc_inspector = None
    elif payload.qc_inspector is not None:
        pl.qc_inspector = payload.qc_inspector

    # Rebuild lines. Scan confirmations are carried across the rebuild by carton:
    # the editor saves before dispatching, and dropping picked_at here would make
    # dispatch reject every carton the floor had already scanned.
    if payload.lines is not None:
        confirmed = {
            str(old.batch_id): (old.picked_at, old.picked_by)
            for old in pl.lines if old.batch_id and old.picked_at
        }
        for old in list(pl.lines):
            await db.delete(old)
        await db.flush()
        for l in payload.lines:
            picked_at, picked_by = confirmed.get(str(l.batch_id), (None, None)) if l.batch_id else (None, None)
            db.add(PickListLine(
                pick_list_id=pl.id,
                sales_order_line_id=l.sales_order_line_id,
                item_id=l.item_id,
                qty_picked=l.qty_picked,
                source_location_id=l.source_location_id,
                batch_id=l.batch_id,
                picked_at=picked_at,
                picked_by=picked_by,
            ))

    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="UPDATE", entity_type="PickList",
        entity_id=str(pl.id), details=f"Updated pick list {pl.code}",
    )

    pl = await _load(db, pl_id)
    return _decorate(pl)


@router.post("/{pl_id}/scan", response_model=PickListResponse)
async def scan_pick_list_unit(
    pl_id: uuid.UUID,
    payload: PickListScanPayload,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_any_permission('pick_list.scan', 'sales.manage')),
):
    """Picker scanned a carton QR.

    Confirms the matching suggested line when one exists; otherwise appends the
    carton to the first SO line that ordered the same item. The scan is what
    turns a *suggested* pick into a *confirmed* one — a plan the floor never
    confirmed must not dispatch.

    The narrow `pick_list.scan` code exists because this is the one pick-list
    action a floor picker performs. Gating it on `sales.manage` like the rest of
    the router would hand every picker create, edit, dispatch and delete on the
    whole sales module. `sales.manage` still passes so existing roles keep working.
    """
    pl = await _load(db, pl_id)
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
    if pl.status in ("DISPATCHED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"Pick list already {pl.status}")

    code = (payload.code or "").strip()
    pu_result = await db.execute(select(Batch).filter(Batch.batch_number == code))
    pu = pu_result.scalars().first()
    if not pu:
        raise HTTPException(status_code=404, detail=f"No lot or carton found for '{code}'")
    if not packing_service.is_packed_unit(pu):
        raise HTTPException(status_code=400, detail=f"{code} is not a packed carton")
    if pu.quality_status != "GOOD":
        raise HTTPException(status_code=400, detail=f"Carton {code} is {pu.quality_status}")

    picked_by = payload.picked_by or current_user.username
    line = next((l for l in pl.lines if l.batch_id == pu.id), None)

    if line is None:
        # Not suggested — claim it for an SO line ordering this item, if the
        # carton is not already committed to another live pick list.
        taken = await packing_service.allocated_unit_ids(db)
        if pu.id in taken:
            raise HTTPException(status_code=400, detail=f"Carton {code} is already on another pick list")
        so_result = await db.execute(
            select(SalesOrder).options(selectinload(SalesOrder.lines)).filter(SalesOrder.id == pl.sales_order_id)
        )
        so = so_result.scalars().first()
        target = next((sl for sl in (so.lines if so else []) if sl.item_id == pu.item_id), None)
        if not target:
            raise HTTPException(status_code=400, detail=f"Carton {code} is not an item on this sales order")
        loc = await _unit_location(db, pu)
        qty = 0.0
        if loc:
            qty = await stock_service.get_stock_balance(db, pu.item_id, loc, [], str(pu.id))
        line = PickListLine(
            pick_list_id=pl.id,
            sales_order_line_id=target.id,
            item_id=pu.item_id,
            qty_picked=qty,
            source_location_id=loc,
            batch_id=pu.id,
        )
        db.add(line)

    line.picked_at = datetime.utcnow()
    line.picked_by = picked_by
    if pl.status == "DRAFT":
        pl.status = "PICKING"
    await db.flush()

    # All cartons confirmed -> ready for QC / dispatch. Re-read the lines rather
    # than using pl.lines: a line appended above sets pick_list_id directly, which
    # does not back-populate the already-loaded collection, so the stale copy
    # would miss it and flip the list to PICKED one carton early.
    remaining = await db.execute(
        select(func.count(PickListLine.id)).filter(
            PickListLine.pick_list_id == pl.id,
            PickListLine.batch_id.isnot(None),
            PickListLine.picked_at.is_(None),
        )
    )
    if (remaining.scalar() or 0) == 0:
        pl.status = "PICKED"

    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="PICK", entity_type="PickList",
        entity_id=str(pl_id), details=f"Scanned carton {code} onto pick list {pl.code}",
    )

    pl = await _load(db, pl_id)
    return _decorate(pl)


# NOTE: `POST /pick-lists/{id}/dispatch` was removed when the loading-deck gate
# was added. A pick list is an internal instruction and ends at PICKED; goods
# issue now runs from `POST /shipments/{id}/dispatch`, after a second person has
# checked the load against the printed Surat Jalan. Leaving a direct route open
# here would have left the four-eyes control bypassable by one HTTP call. The
# stock-out logic itself lives in `services/dispatch_service.py`.


@router.delete("/{pl_id}")
async def delete_pick_list(
    pl_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('sales.manage')),
):
    result = await db.execute(select(PickList).filter(PickList.id == pl_id))
    pl = result.scalars().first()
    if not pl:
        raise HTTPException(status_code=404, detail="Pick list not found")
    if pl.status == "DISPATCHED":
        raise HTTPException(status_code=400, detail="Cannot delete a dispatched pick list")

    code = pl.code
    await db.delete(pl)
    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="DELETE", entity_type="PickList",
        entity_id=str(pl_id), details=f"Deleted pick list {code}",
    )
    return {"ok": True}
