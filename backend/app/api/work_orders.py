from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from sqlalchemy.orm import joinedload, selectinload
from typing import Optional
from app.db.session import get_async_db
from app.models.work_order import WorkOrder
from app.models.manufacturing import ManufacturingOrder
from app.models.routing import WorkCenter
from app.models.item import Item
from app.models.bom import BOMOperation
from app.models.location import Location
from app.models.batch import Batch, BeamMount
from app.models.stock_ledger import StockLedger
from app.models.stock_balance import StockBalance
from app.models.dyeing_setting import DyeRecipe, DyeingRun, dye_recipe_attribute_values
from app.schemas import (
    WorkOrderCreate, WorkOrderResponse, WORequiredMaterial, WOStagePayload,
    LeftoverBeamCreate, BatchResponse, PutawayBinOption, PutawaySuggestionResponse,
    WorkOrderMarkPrintedBulk, BeamMountResponse, BeamMountCreate, BeamDismountPayload,
    LoomBeamStatus,
)
from app.models.auth import User
from app.api.auth import get_current_user, require_permission, require_any_permission, wo_scope_ok
from app.api.batches import generate_batch_number
from app.services import audit_service, stock_service, beam_service, work_center_service, reject_service
from app.core.ws_manager import manager
from datetime import datetime
import uuid


async def _find_matching_dye_recipe(db: AsyncSession, mo_attr_ids: set) -> Optional[DyeRecipe]:
    """Find active DyeRecipe whose attribute_values exactly match the given set."""
    count = len(mo_attr_ids)
    # Recipes containing ALL required attribute values
    has_all = (
        select(dye_recipe_attribute_values.c.dye_recipe_id)
        .where(dye_recipe_attribute_values.c.attribute_value_id.in_(mo_attr_ids))
        .group_by(dye_recipe_attribute_values.c.dye_recipe_id)
        .having(func.count() == count)
    )
    # Among those, only ones with no extra attribute values
    result = await db.execute(
        select(DyeRecipe)
        .where(DyeRecipe.id.in_(has_all))
        .where(DyeRecipe.is_active == True)
        .join(dye_recipe_attribute_values, DyeRecipe.id == dye_recipe_attribute_values.c.dye_recipe_id)
        .group_by(DyeRecipe.id)
        .having(func.count() == count)
    )
    return result.scalars().first()


async def _match_recipe_by_color(db: AsyncSession, color_id) -> Optional[DyeRecipe]:
    """Find the active DyeRecipe for a Color Library shade (modern color-type path)."""
    if not color_id:
        return None
    res = await db.execute(
        select(DyeRecipe)
        .where(DyeRecipe.color_id == color_id, DyeRecipe.is_active == True)
        .order_by(DyeRecipe.code)
    )
    return res.scalars().first()


async def _resolve_dye_recipe(db: AsyncSession, mo) -> DyeRecipe:
    """Resolve the active DyeRecipe for a DYEING WO on this MO.

    Color-type FGs carry a Color Library shade (`mo.color_id`) and match a recipe
    by `color_id`. Everything else falls back to the legacy exact attribute-value
    match. Raises 422 when neither resolves — the DYEING WO create is a hard gate.
    """
    if getattr(mo, "color_id", None):
        recipe = await _match_recipe_by_color(db, mo.color_id)
        if not recipe:
            raise HTTPException(status_code=422, detail="No active dyeing recipe found for this order's color")
        return recipe

    # Ordered against a shade still in lab dip: greige can run, but dyeing can't
    # start until the lab dip is approved (which auto-fills color_id) or a color is
    # confirmed on the MO. Point the operator at the real blocker.
    if getattr(mo, "labdip_variant_code", None):
        raise HTTPException(
            status_code=422,
            detail=f"Color still in lab dip ({mo.labdip_variant_code}) — approve the lab dip or set an approved color on the MO before creating the dyeing WO",
        )

    mo_attr_ids = {av.id for av in mo.attribute_values}
    if not mo_attr_ids:
        raise HTTPException(status_code=422, detail="MO has no color or attributes — cannot match a dyeing recipe")
    recipe = await _find_matching_dye_recipe(db, mo_attr_ids)
    if not recipe:
        raise HTTPException(status_code=422, detail="No active dyeing recipe found matching this MO's attribute combination")
    return recipe

router = APIRouter()

def _wo_options():
    return [joinedload(WorkOrder.work_center), selectinload(WorkOrder.completions)]

async def _wc_type(db: AsyncSession, work_center_id) -> str | None:
    """Fetch WorkCenter.center_type by id without relying on a lazy-loaded
    relationship (async sessions can't lazy-load — see CLAUDE.md gotcha)."""
    if not work_center_id:
        return None
    res = await db.execute(select(WorkCenter.center_type).filter(WorkCenter.id == work_center_id))
    return res.scalar()

def _require_wo_scope(current_user: User, center_type: str | None):
    if not wo_scope_ok(current_user, center_type):
        raise HTTPException(status_code=403, detail=f"Your role is not scoped to work center type '{center_type}'")

@router.post("/work-orders", response_model=WorkOrderResponse)
async def create_work_order(
    payload: WorkOrderCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.create')),
):
    mo_result = await db.execute(
        select(ManufacturingOrder)
        .options(
            selectinload(ManufacturingOrder.attribute_values),
            selectinload(ManufacturingOrder.planned_components),
        )
        .filter(ManufacturingOrder.id == payload.manufacturing_order_id)
    )
    mo = mo_result.scalars().first()
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    # Count existing WOs for this MO to derive scoped sequence number
    count_result = await db.execute(
        select(func.count()).select_from(WorkOrder)
        .where(WorkOrder.manufacturing_order_id == payload.manufacturing_order_id)
    )
    wo_seq_num = (count_result.scalar() or 0) + 1
    wo_code = f"{mo.code}-WO-{wo_seq_num:02d}"

    # Load work center and check for DYEING gate
    wc = None
    planned_recipe_id = None
    if payload.work_center_id:
        wc_result = await db.execute(
            select(WorkCenter).filter(WorkCenter.id == payload.work_center_id)
        )
        wc = wc_result.scalars().first()
        _require_wo_scope(current_user, wc.center_type if wc else None)

        if wc and wc.center_type == "DYEING":
            matched_recipe = await _resolve_dye_recipe(db, mo)
            planned_recipe_id = matched_recipe.id

    # Auto-generate name from work center; fall back to code
    name = payload.name
    if not name:
        name = wc.name if wc else wo_code

    sequence = payload.sequence if payload.sequence and payload.sequence > 1 else wo_seq_num

    # Inherit locations from work center unless caller explicitly provided them.
    # "From the work center" means its effective value — a machine with no own
    # locations takes its GROUP's (then its TYPE's), so groups are configured once.
    input_location_id = payload.input_location_id
    output_location_id = payload.output_location_id
    if wc:
        wc_in, wc_out = await work_center_service.resolve_locations(db, wc.id)
        if input_location_id is None:
            input_location_id = wc_in
        if output_location_id is None:
            output_location_id = wc_out

    wo = WorkOrder(
        manufacturing_order_id=payload.manufacturing_order_id,
        sequence=sequence,
        code=wo_code,
        name=name,
        work_center_id=payload.work_center_id,
        bom_operation_id=payload.bom_operation_id,
        planned_recipe_id=planned_recipe_id,
        input_location_id=input_location_id,
        output_location_id=output_location_id,
        next_destination_location_id=payload.next_destination_location_id,
        next_destination_work_center_id=payload.next_destination_work_center_id,
        qty=payload.qty,
        planned_duration_hours=payload.planned_duration_hours,
        notes=payload.notes,
        target_start_date=payload.target_start_date,
        target_end_date=payload.target_end_date,
        status="PENDING",
    )
    db.add(wo)
    await db.flush()  # get wo.id before creating DyeingRun

    # Auto-seed pending DyeingRun so operator sees pre-filled recipe
    if planned_recipe_id:
        db.add(DyeingRun(
            work_order_id=wo.id,
            recipe_id=planned_recipe_id,
            run_number=1,
            substrate_qty=wo.qty or 0,
            status="PENDING",
        ))

    # Auto-start MO on first WO creation if MO is still PENDING.
    # Stock is now checked at staging time (line-side issue), not here — creating a
    # WO no longer requires its components to already be on hand. Just flip the MO
    # to IN_PROGRESS so completions can be logged once materials are staged.
    if mo.status == "PENDING":
        mo.status = "IN_PROGRESS"
        mo.actual_start_date = datetime.utcnow()
        await db.commit()
        await manager.broadcast({"type": "MANUFACTURING_ORDER_UPDATE", "mo_id": str(mo.id), "status": "IN_PROGRESS", "code": mo.code})
    else:
        await db.commit()

    result = await db.execute(
        select(WorkOrder).options(*_wo_options()).filter(WorkOrder.id == wo.id)
    )
    wo = result.scalars().first()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="CREATE",
        entity_type="WORK_ORDER", entity_id=str(wo.id),
        details=f"Created Work Order '{wo.code}'",
        changes=payload.model_dump()
    )
    await manager.broadcast({"type": "WORK_ORDER_UPDATE", "wo_id": str(wo.id), "status": "PENDING"})

    response = WorkOrderResponse.model_validate(wo)

    # Soft over-assignment check
    total_assigned_result = await db.execute(
        select(func.sum(WorkOrder.qty)).where(
            WorkOrder.manufacturing_order_id == wo.manufacturing_order_id,
            WorkOrder.qty.isnot(None),
        )
    )
    total_assigned = float(total_assigned_result.scalar() or 0)
    mo_qty = float(mo.qty) if mo.qty else 0.0
    if mo_qty > 0 and total_assigned > mo_qty:
        response.warning = "total_assigned_exceeds_mo_qty"
        response.total_assigned = total_assigned
        response.mo_qty = mo_qty

    return response

@router.put("/work-orders/{wo_id}", response_model=WorkOrderResponse)
async def update_work_order(
    wo_id: str,
    payload: WorkOrderCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.edit')),
):
    result = await db.execute(
        select(WorkOrder).options(*_wo_options()).filter(WorkOrder.id == wo_id)
    )
    wo = result.scalars().first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    _require_wo_scope(current_user, wo.work_center.center_type if wo.work_center else None)
    if payload.work_center_id != wo.work_center_id:
        _require_wo_scope(current_user, await _wc_type(db, payload.work_center_id))

    wo.sequence = payload.sequence
    if payload.name is not None:
        wo.name = payload.name
    wo.work_center_id = payload.work_center_id
    wo.bom_operation_id = payload.bom_operation_id
    wo.next_destination_location_id = payload.next_destination_location_id
    wo.next_destination_work_center_id = payload.next_destination_work_center_id
    wo.qty = payload.qty
    wo.planned_duration_hours = payload.planned_duration_hours
    wo.notes = payload.notes
    wo.target_start_date = payload.target_start_date
    wo.target_end_date = payload.target_end_date

    # Re-populate locations: explicit payload values win; fall back to new WC's defaults
    if payload.input_location_id is not None or payload.output_location_id is not None:
        wo.input_location_id = payload.input_location_id
        wo.output_location_id = payload.output_location_id
    elif payload.work_center_id:
        wc_result = await db.execute(select(WorkCenter).filter(WorkCenter.id == payload.work_center_id))
        wc_upd = wc_result.scalars().first()
        if wc_upd:
            wo.input_location_id, wo.output_location_id = await work_center_service.resolve_locations(db, wc_upd.id)
    else:
        wo.input_location_id = None
        wo.output_location_id = None

    await db.commit()

    result = await db.execute(
        select(WorkOrder).options(*_wo_options()).filter(WorkOrder.id == wo_id)
    )
    wo = result.scalars().first()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="UPDATE",
        entity_type="WORK_ORDER", entity_id=wo_id,
        details=f"Updated Work Order",
        changes=payload.model_dump()
    )
    await manager.broadcast({"type": "WORK_ORDER_UPDATE", "wo_id": wo_id, "status": wo.status})

    response = WorkOrderResponse.model_validate(wo)

    # Soft over-assignment check
    total_assigned_result = await db.execute(
        select(func.sum(WorkOrder.qty)).where(
            WorkOrder.manufacturing_order_id == wo.manufacturing_order_id,
            WorkOrder.qty.isnot(None),
        )
    )
    total_assigned = float(total_assigned_result.scalar() or 0)

    mo_result = await db.execute(
        select(ManufacturingOrder).filter(ManufacturingOrder.id == wo.manufacturing_order_id)
    )
    mo = mo_result.scalars().first()
    mo_qty = float(mo.qty) if mo and mo.qty else 0.0

    if mo_qty > 0 and total_assigned > mo_qty:
        response.warning = "total_assigned_exceeds_mo_qty"
        response.total_assigned = total_assigned
        response.mo_qty = mo_qty

    return response

@router.put("/work-orders/{wo_id}/status", response_model=WorkOrderResponse)
async def update_work_order_status(
    wo_id: str,
    status: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.log')),
):
    valid = {"PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid}")

    result = await db.execute(
        select(WorkOrder).options(*_wo_options()).filter(WorkOrder.id == wo_id)
    )
    wo = result.scalars().first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    _require_wo_scope(current_user, wo.work_center.center_type if wo.work_center else None)

    wo.status = status
    if status == "IN_PROGRESS" and not wo.actual_start_date:
        wo.actual_start_date = datetime.utcnow()
    if status == "COMPLETED" and not wo.actual_end_date:
        wo.actual_end_date = datetime.utcnow()

    # Starting a WEAVING WO no longer touches the warp: beams are mounted on the
    # machine and stay lotted for their whole life there, shared by every WO that
    # runs on the loom. Nothing to merge — see services/beam_service.py.
    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "STATUS_CHANGE", "WorkOrder", wo_id,
        details=f"Status -> {status}"
    )
    await manager.broadcast({"type": "WORK_ORDER_UPDATE", "wo_id": wo_id, "status": status})

    result = await db.execute(
        select(WorkOrder).options(*_wo_options()).filter(WorkOrder.id == wo_id)
    )
    return result.scalars().first()

@router.post("/work-orders/mark-printed-bulk")
async def mark_work_orders_printed_bulk(
    payload: WorkOrderMarkPrintedBulk,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.print_card')),
):
    """Stamp print time on many WOs at once (bulk Kartu Kerja print)."""
    if payload.kind not in ("card", "labels"):
        raise HTTPException(status_code=400, detail="kind must be 'card' or 'labels'")
    if not payload.ids:
        return {"updated": 0}
    result = await db.execute(select(WorkOrder).filter(WorkOrder.id.in_(payload.ids)))
    wos = result.scalars().all()
    now = datetime.utcnow()
    for wo in wos:
        if payload.kind == "card":
            wo.card_printed_at = now
        else:
            wo.labels_printed_at = now
    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "PRINT", "WorkOrder", ",".join(str(w.id) for w in wos)[:255],
        details=f"Bulk printed {'Kartu Kerja' if payload.kind == 'card' else 'bag labels'} ({len(wos)} WO)"
    )
    await manager.broadcast({"type": "WORK_ORDER_UPDATE", "bulk": True})
    return {"updated": len(wos)}


@router.post("/work-orders/{wo_id}/mark-printed", response_model=WorkOrderResponse)
async def mark_work_order_printed(
    wo_id: str,
    kind: str = "card",
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.print_card')),
):
    """Stamp print time on a WO. kind='card' (Kartu Kerja) or 'labels' (bag labels).
    Idempotent — reprints just overwrite with a newer timestamp."""
    if kind not in ("card", "labels"):
        raise HTTPException(status_code=400, detail="kind must be 'card' or 'labels'")
    result = await db.execute(
        select(WorkOrder).options(*_wo_options()).filter(WorkOrder.id == wo_id)
    )
    wo = result.scalars().first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")

    now = datetime.utcnow()
    if kind == "card":
        wo.card_printed_at = now
    else:
        wo.labels_printed_at = now

    await db.commit()
    await audit_service.log_activity(
        db, current_user.id, "PRINT", "WorkOrder", wo_id,
        details=f"Printed {'Kartu Kerja' if kind == 'card' else 'bag labels'}"
    )
    await manager.broadcast({"type": "WORK_ORDER_UPDATE", "wo_id": wo_id, "status": wo.status})

    result = await db.execute(
        select(WorkOrder).options(*_wo_options()).filter(WorkOrder.id == wo_id)
    )
    return result.scalars().first()


@router.post("/work-orders/bulk", response_model=list[WorkOrderResponse])
async def create_work_orders_bulk(
    payloads: list[WorkOrderCreate],
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.create')),
):
    if not payloads:
        return []

    mo_id = payloads[0].manufacturing_order_id
    if any(p.manufacturing_order_id != mo_id for p in payloads):
        raise HTTPException(status_code=400, detail="All items must share the same manufacturing_order_id")

    mo_result = await db.execute(
        select(ManufacturingOrder)
        .options(
            selectinload(ManufacturingOrder.attribute_values),
            selectinload(ManufacturingOrder.planned_components),
        )
        .filter(ManufacturingOrder.id == mo_id)
    )
    mo = mo_result.scalars().first()
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    count_result = await db.execute(
        select(func.count()).select_from(WorkOrder)
        .where(WorkOrder.manufacturing_order_id == mo_id)
    )
    existing_count = count_result.scalar() or 0

    wc_ids = {p.work_center_id for p in payloads if p.work_center_id}
    wc_cache: dict = {}
    wc_loc_map = await work_center_service.location_map(db) if wc_ids else {}
    if wc_ids:
        wc_result = await db.execute(select(WorkCenter).filter(WorkCenter.id.in_(wc_ids)))
        for wc_row in wc_result.scalars().all():
            wc_cache[wc_row.id] = wc_row

    for wc_id in wc_ids:
        _require_wo_scope(current_user, wc_cache[wc_id].center_type if wc_id in wc_cache else None)

    created_wos = []
    for i, payload in enumerate(payloads):
        seq_num = existing_count + i + 1
        wo_code = f"{mo.code}-WO-{seq_num:02d}"
        wc = wc_cache.get(payload.work_center_id) if payload.work_center_id else None

        planned_recipe_id = None
        if wc and wc.center_type == "DYEING":
            planned_recipe_id = (await _resolve_dye_recipe(db, mo)).id

        name = payload.name or (wc.name if wc else wo_code)
        sequence = payload.sequence if payload.sequence and payload.sequence > 1 else seq_num

        input_location_id = payload.input_location_id
        output_location_id = payload.output_location_id
        if wc:
            wc_in, wc_out = work_center_service.resolve_locations_from_map(wc_loc_map, wc.id)[:2]
            if input_location_id is None:
                input_location_id = wc_in
            if output_location_id is None:
                output_location_id = wc_out

        wo = WorkOrder(
            manufacturing_order_id=mo_id,
            sequence=sequence,
            code=wo_code,
            name=name,
            work_center_id=payload.work_center_id,
            bom_operation_id=payload.bom_operation_id,
            planned_recipe_id=planned_recipe_id,
            input_location_id=input_location_id,
            output_location_id=output_location_id,
            qty=payload.qty,
            ends=payload.ends,
            planned_duration_hours=payload.planned_duration_hours,
            notes=payload.notes,
            target_start_date=payload.target_start_date,
            target_end_date=payload.target_end_date,
            next_destination_work_center_id=payload.next_destination_work_center_id,
            next_destination_location_id=payload.next_destination_location_id,
            status="PENDING",
        )
        db.add(wo)
        await db.flush()

        if planned_recipe_id:
            db.add(DyeingRun(
                work_order_id=wo.id,
                recipe_id=planned_recipe_id,
                run_number=1,
                substrate_qty=wo.qty or 0,
                status="PENDING",
            ))
        created_wos.append(wo)

    # Auto-start MO once if still PENDING. Stock is checked at staging time
    # (line-side issue), not at WO creation.
    if mo.status == "PENDING":
        mo.status = "IN_PROGRESS"
        mo.actual_start_date = datetime.utcnow()

    await db.commit()

    wo_ids = [wo.id for wo in created_wos]
    result = await db.execute(
        select(WorkOrder).options(*_wo_options())
        .filter(WorkOrder.id.in_(wo_ids))
        .order_by(WorkOrder.sequence)
    )
    wos = result.scalars().all()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="CREATE",
        entity_type="WORK_ORDER", entity_id=str(mo_id),
        details=f"Bulk created {len(wos)} Work Orders for MO '{mo.code}'",
        changes={"count": len(wos), "mo_id": str(mo_id)}
    )
    await manager.broadcast({"type": "WORK_ORDER_UPDATE", "mo_id": str(mo_id), "bulk": True})
    if mo.status == "IN_PROGRESS":
        await manager.broadcast({"type": "MANUFACTURING_ORDER_UPDATE", "mo_id": str(mo.id), "status": "IN_PROGRESS", "code": mo.code})

    return list(wos)


# ─────────────────────────────────────────────────────────────────────────────
# Material staging (line-side issue)
#
# A WO consumes only the materials allocated to its routing step
# (planned_component.bom_operation_id == wo.bom_operation_id). Staging moves
# those materials from each one's source store -> the WO's input location, so
# netting (source store) and consumption (input loc) reference the same stock.
# ─────────────────────────────────────────────────────────────────────────────

async def _backfill_wo_locations(db: AsyncSession, wo: WorkOrder) -> None:
    """Fill a WO's blank locations from its work center's effective ones.

    WOs snapshot locations at creation, so a WO cut before its group had staging
    areas set (or before location inheritance existed) carries NULLs and would
    refuse to stage. Re-resolve here instead of forcing the floor to re-cut the WO.
    Caller commits — read paths just get the in-memory value."""
    if not wo.work_center_id or (wo.input_location_id and wo.output_location_id):
        return
    wc_in, wc_out = await work_center_service.resolve_locations(db, wo.work_center_id)
    if not wo.input_location_id and wc_in:
        wo.input_location_id = wc_in
    if not wo.output_location_id and wc_out:
        wo.output_location_id = wc_out


async def _load_wo_and_mo(db: AsyncSession, wo_id: str):
    res = await db.execute(select(WorkOrder).filter(WorkOrder.id == wo_id))
    wo = res.scalars().first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    await _backfill_wo_locations(db, wo)
    mo_res = await db.execute(
        select(ManufacturingOrder)
        .options(selectinload(ManufacturingOrder.planned_components))
        .filter(ManufacturingOrder.id == wo.manufacturing_order_id)
    )
    mo = mo_res.scalars().first()
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")
    return wo, mo


async def _wo_staged_by_item(db: AsyncSession, wo: WorkOrder) -> dict[str, float]:
    """Qty already staged to this WO's input location, per item (positive
    'Staging' ledger rows tagged with this WO's id)."""
    if not wo.input_location_id:
        return {}
    rows = await db.execute(
        select(StockLedger.item_id, func.sum(StockLedger.qty_change))
        .where(
            StockLedger.reference_type == "Staging",
            StockLedger.reference_id == str(wo.id),
            StockLedger.location_id == wo.input_location_id,
            StockLedger.qty_change > 0,
        )
        .group_by(StockLedger.item_id)
    )
    return {str(i): float(s or 0) for i, s in rows.all()}


async def _wo_step_components(db: AsyncSession, wo: WorkOrder, mo: ManufacturingOrder) -> list:
    """Planned components this WO should stage/consume.

    Detection is layered, most-specific first, so a WO always resolves its
    materials even when the BOM routing step isn't wired up perfectly:
      1. Exact routing step — material pegged to this WO's bom_operation_id.
      2. Work-center TYPE — material whose BOM operation runs on the same kind
         of work center as this WO (DYEING, SETTING, etc.). This mirrors how WO
         type is detected elsewhere and covers the common case where the WO
         wasn't handed the exact bom_operation_id but the work center matches.
      3. WEAVING beam special-case — beams are plant-level and usually untagged;
         a WEAVING WO consumes the MO's beam-category components directly.
      4. Step-agnostic materials — BOM lines pinned to no operation belong to
         any step, so surface them rather than leave the WO with nothing."""
    comps = list(mo.planned_components or [])
    if not comps:
        return []

    # 1) Exact routing-step match.
    if wo.bom_operation_id:
        exact = [
            c for c in comps
            if c.bom_operation_id and str(c.bom_operation_id) == str(wo.bom_operation_id)
        ]
        if exact:
            return exact

    if not wo.work_center_id:
        return []
    wc_type = (await _wc_type(db, wo.work_center_id)) or ""

    # 2) Work-center-type match (operation-agnostic detection).
    op_ids = [c.bom_operation_id for c in comps if c.bom_operation_id]
    if wc_type and op_ids:
        rows = await db.execute(
            select(BOMOperation.id, WorkCenter.center_type)
            .join(WorkCenter, BOMOperation.work_center_id == WorkCenter.id)
            .where(BOMOperation.id.in_(op_ids))
        )
        same_ops = {str(oid) for oid, ct in rows.all() if (ct or "") == wc_type}
        by_type = [c for c in comps if c.bom_operation_id and str(c.bom_operation_id) in same_ops]
        if by_type:
            return by_type

    # 3) WEAVING beam special-case.
    if wc_type.upper() in ("WEAVING", "TENUN"):
        ids = await beam_service.beam_item_ids(db, [c.item_id for c in comps])
        beams = [c for c in comps if str(c.item_id) in ids]
        if beams:
            return beams

    # 4) Step-agnostic materials (not pinned to any operation).
    return [c for c in comps if not c.bom_operation_id]


async def _suggest_beam_batch(db: AsyncSession, mo: ManufacturingOrder, item_id) -> uuid.UUID | None:
    """Beam is generic plant-level stock, not pegged to a producing MO (no
    MODependency link between a WEAVING MO and the BEAMING MOs that made its
    beam — see plant-level netting) and not pinned to a fixed location either.
    Suggest the oldest unconsumed batch of this item anywhere in the plant,
    FIFO, still fully overridable in the staging picker."""
    batch_res = await db.execute(
        select(Batch)
        .where(Batch.item_id == item_id, Batch.quality_status.notin_(reject_service.UNPICKABLE_GRADES))
        .order_by(Batch.created_at.asc())
    )
    candidates = batch_res.scalars().all()
    if not candidates:
        return None
    bal_q = (
        select(StockBalance.batch_key, func.sum(StockBalance.qty))
        .filter(StockBalance.batch_key.in_([str(b.id) for b in candidates]))
        .group_by(StockBalance.batch_key)
    )
    remaining = {k: float(v or 0) for k, v in (await db.execute(bal_q)).all()}
    for b in candidates:
        if remaining.get(str(b.id), 0.0) > 0:
            return b.id
    return None


async def _descendant_leaves(db: AsyncSession, root_id) -> list[Location]:
    """Leaf locations (bins) under a root, walking the max-3-level hierarchy."""
    nodes: dict[str, Location] = {}
    level_ids = [root_id]
    for _ in range(2):  # warehouse -> zone -> bin
        res = await db.execute(
            select(Location).options(joinedload(Location.parent)).where(Location.parent_id.in_(level_ids))
        )
        children = res.scalars().all()
        if not children:
            break
        for c in children:
            nodes[str(c.id)] = c
        level_ids = [c.id for c in children]
    parent_ids = {str(c.parent_id) for c in nodes.values()}
    return [c for c in nodes.values() if str(c.id) not in parent_ids]


@router.get("/manufacturing-orders/{mo_id}/putaway-suggestion", response_model=PutawaySuggestionResponse)
async def get_mo_putaway_suggestion(
    mo_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Putaway planning aid for the MO: candidate bins under the routing's final
    output area plus a suggested one. Priority: bin already assigned on the MO
    -> item master's default putaway bin -> bin already holding the output item
    (addition to stock) -> empty bin -> first bin by code. Advisory — planning
    picks and saves via PATCH .../putaway."""
    mo_res = await db.execute(select(ManufacturingOrder).filter(ManufacturingOrder.id == mo_id))
    mo = mo_res.scalars().first()
    if not mo:
        raise HTTPException(status_code=404, detail="Manufacturing Order not found")

    # Root area = MO's assigned bin's zone if set, else the item master's default
    # putaway bin, else the final routing step's work-center output location,
    # else the last WO's output location.
    root_id = mo.planned_putaway_location_id
    item_default_used = False
    if not root_id and mo.item_id:
        item_default_res = await db.execute(
            select(Item.default_putaway_location_id).filter(Item.id == mo.item_id)
        )
        root_id = item_default_res.scalar()
        item_default_used = root_id is not None
    if not root_id and mo.bom_id:
        # Walk the routing backwards and take the first step whose work center
        # resolves an output location — its own or one inherited from its group.
        op_res = await db.execute(
            select(BOMOperation.work_center_id)
            .where(BOMOperation.bom_id == mo.bom_id, BOMOperation.work_center_id.isnot(None))
            .order_by(BOMOperation.sequence.desc())
        )
        op_wc_ids = [r[0] for r in op_res.all()]
        if op_wc_ids:
            wc_loc_map = await work_center_service.location_map(db)
            for wc_id in op_wc_ids:
                out_id = work_center_service.resolve_locations_from_map(wc_loc_map, wc_id)[1]
                if out_id:
                    root_id = out_id
                    break
    if not root_id:
        wo_res = await db.execute(
            select(WorkOrder.output_location_id)
            .where(WorkOrder.manufacturing_order_id == mo.id, WorkOrder.output_location_id.isnot(None))
            .order_by(WorkOrder.sequence.desc())
            .limit(1)
        )
        root_id = wo_res.scalar()
    if not root_id:
        return PutawaySuggestionResponse()

    root_res = await db.execute(
        select(Location).options(joinedload(Location.parent)).where(Location.id == root_id)
    )
    root = root_res.scalars().first()
    if not root:
        return PutawaySuggestionResponse()

    configured_bin = None
    leaves = await _descendant_leaves(db, root.id)
    if not leaves:
        # Output points straight at a leaf (bin, or childless zone/warehouse):
        # that explicit config stays the suggestion; siblings become overrides.
        configured_bin = root
        leaves = [root]
        if root.parent_id:
            sib_res = await db.execute(
                select(Location).options(joinedload(Location.parent)).where(Location.parent_id == root.parent_id)
            )
            leaves += [s for s in sib_res.scalars().all()
                       if not s.has_children and str(s.id) != str(root.id)]

    bal_res = await db.execute(
        select(
            StockBalance.location_id,
            func.sum(StockBalance.qty),
            func.sum(case((StockBalance.item_id == mo.item_id, StockBalance.qty), else_=0)),
        )
        .where(StockBalance.location_id.in_([l.id for l in leaves]))
        .group_by(StockBalance.location_id)
    )
    totals = {str(lid): (float(t or 0), float(i or 0)) for lid, t, i in bal_res.all()}

    leaves.sort(key=lambda l: (l.code or l.name or ""))
    configured_reason = "item_default" if item_default_used else "configured"
    suggested, reason = configured_bin, (configured_reason if configured_bin is not None else None)
    if suggested is None:
        same = [l for l in leaves if totals.get(str(l.id), (0.0, 0.0))[1] > 0]
        if same:
            suggested = max(same, key=lambda l: totals[str(l.id)][1])
            reason = "same_item"
    if suggested is None:
        empty = next((l for l in leaves if totals.get(str(l.id), (0.0, 0.0))[0] <= 0), None)
        if empty is not None:
            suggested, reason = empty, "empty_bin"
    if suggested is None:
        suggested, reason = leaves[0], "first_bin"

    def _opt(l: Location) -> PutawayBinOption:
        t, i = totals.get(str(l.id), (0.0, 0.0))
        pn = l.parent_name
        return PutawayBinOption(
            id=l.id, code=l.code, name=l.name,
            full_path=f"{pn} / {l.name}" if pn else (l.name or l.code),
            total_on_hand=t, item_on_hand=i,
        )

    return PutawaySuggestionResponse(
        suggested_location_id=suggested.id,
        reason=reason,
        bins=[_opt(l) for l in leaves],
    )


async def _wo_required_rows(db: AsyncSession, wo: WorkOrder, mo: ManufacturingOrder) -> list[WORequiredMaterial]:
    comps = await _wo_step_components(db, wo, mo)
    if not comps:
        return []
    staged_by_item = await _wo_staged_by_item(db, wo)

    item_ids = [c.item_id for c in comps]
    # Warp beams don't belong to a WO — they're mounted on the loom and shared by
    # every WO that runs there (size S, then M, then L, all off one warp). So for
    # beam items "staged" means "mounted on this machine", read from the loom's
    # open BeamMounts instead of this WO's staging ledger tags. Without this, the
    # second size WO sees staged=0 even though the warp is physically up.
    beam_ids: set[str] = set()
    beam_slots = 1
    if await beam_service.is_weaving_wo(db, wo):
        beam_ids = await beam_service.beam_item_ids(db, item_ids)
        if beam_ids:
            beam_slots = max(1, int((await db.execute(
                select(WorkCenter.beam_slots).where(WorkCenter.id == wo.work_center_id)
            )).scalar() or 1))
            for bid in beam_ids:
                staged_by_item[bid] = await beam_service.mounted_qty(
                    db, wo.work_center_id, uuid.UUID(bid)
                )

    items_res = await db.execute(select(Item).where(Item.id.in_(item_ids)))
    items = {str(it.id): it for it in items_res.scalars().all()}

    loc_ids = {(c.source_location_id or mo.source_location_id or mo.location_id) for c in comps}
    loc_ids = {l for l in loc_ids if l}
    loc_names: dict[str, str] = {}
    if loc_ids:
        lres = await db.execute(
            select(Location.id, Location.name, Location.code).where(Location.id.in_(loc_ids))
        )
        loc_names = {str(i): (n or c or "") for i, n, c in lres.all()}

    wo_qty = float(wo.qty or mo.qty or 0)
    rows: list[WORequiredMaterial] = []
    for c in comps:
        if c.percentage:
            req = (wo_qty * float(c.percentage)) / 100
        elif c.qty:
            req = wo_qty * float(c.qty)
        else:
            continue
        it = items.get(str(c.item_id))
        # Source resolution (industry chain): BOM-line override -> item-master
        # default issue location -> MO source (legacy fallback). The staging modal
        # can still override per row when none resolves.
        src = c.source_location_id or (it.default_source_location_id if it else None) or mo.source_location_id
        attrs = list(c.attribute_value_ids or [])
        on_hand = await stock_service.get_stock_balance(db, c.item_id, src, attrs) if src else 0.0
        staged = staged_by_item.get(str(c.item_id), 0.0)
        # "Needs a batch pick" = the item is lot_tracked OR it physically sits as
        # batch stock at the source (e.g. a beam — batch-tracked but lot_tracked=false).
        # Staging such an item without a batch would corrupt the batch_key="" balance.
        batch_required = bool(it and it.lot_tracked)
        if not batch_required:
            # Plant-wide check — a batch-tracked item (e.g. beam) may physically sit
            # somewhere other than the resolved default source (see _suggest_beam_batch).
            bcount = await db.execute(
                select(func.count()).select_from(StockBalance).where(
                    StockBalance.item_id == c.item_id,
                    StockBalance.batch_key != "",
                    StockBalance.qty > 0,
                )
            )
            batch_required = (bcount.scalar() or 0) > 0
        suggested_batch_id = await _suggest_beam_batch(db, mo, c.item_id) if batch_required else None
        # A batch-tracked material's real source is wherever its batch sits, not the
        # BOM/item default — once we have a suggestion, prefer its actual location.
        if suggested_batch_id:
            sb_res = await db.execute(
                select(StockBalance.location_id).where(
                    StockBalance.batch_key == str(suggested_batch_id), StockBalance.qty > 0
                ).limit(1)
            )
            sb_loc = sb_res.scalar()
            if sb_loc:
                src = sb_loc
                on_hand = await stock_service.get_stock_balance(db, c.item_id, src, attrs)
                if str(src) not in loc_names:
                    name_res = await db.execute(select(Location.name, Location.code).where(Location.id == src))
                    row = name_res.first()
                    if row:
                        loc_names[str(src)] = row[0] or row[1] or ""
        is_beam = str(c.item_id) in beam_ids
        rows.append(WORequiredMaterial(
            item_id=c.item_id,
            item_code=it.code if it else None,
            item_name=it.name if it else None,
            attribute_value_ids=[uuid.UUID(s) for s in attrs],
            required_qty=req,
            source_location_id=src,
            source_location_name=loc_names.get(str(src)),
            on_hand=float(on_hand),
            staged=staged,
            shortfall=max(0.0, req - staged),
            lot_tracked=batch_required,
            suggested_batch_id=suggested_batch_id,
            is_beam=is_beam,
            mounted_pcs=(
                await beam_service.mounted_pcs(db, wo.work_center_id, c.item_id) if is_beam else 0
            ),
            required_pcs=beam_slots if is_beam else 0,
        ))
    return rows


def _staging_status(rows: list[WORequiredMaterial]) -> str:
    if not rows:
        return "NOT_STAGED"
    # Beams are counted in whole pieces against the loom's beam positions ("4
    # lines = 4 beams"), never in kg — a warp is either up or it isn't.
    def _ok(r: WORequiredMaterial) -> bool:
        if r.is_beam:
            return r.mounted_pcs >= max(1, r.required_pcs)
        return r.staged + 1e-9 >= r.required_qty

    def _touched(r: WORequiredMaterial) -> bool:
        return r.mounted_pcs > 0 if r.is_beam else r.staged > 0

    if not any(_touched(r) for r in rows):
        return "NOT_STAGED"
    return "STAGED" if all(_ok(r) for r in rows) else "PARTIAL"


@router.get("/work-orders/{wo_id}/required-materials", response_model=list[WORequiredMaterial])
async def get_wo_required_materials(
    wo_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    wo, mo = await _load_wo_and_mo(db, wo_id)
    return await _wo_required_rows(db, wo, mo)


@router.post("/work-orders/{wo_id}/stage", response_model=WorkOrderResponse)
async def stage_wo_materials(
    wo_id: str,
    payload: WOStagePayload,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.stage')),
):
    wo, mo = await _load_wo_and_mo(db, wo_id)
    _require_wo_scope(current_user, await _wc_type(db, wo.work_center_id))
    if not wo.input_location_id:
        raise HTTPException(status_code=422, detail="Work Order has no input location — assign a machine with a supply area first")

    # Required map keyed by item: enforce we never stage beyond the step's need.
    required_rows = await _wo_required_rows(db, wo, mo)
    req_by_item = {str(r.item_id): r for r in required_rows}
    if not req_by_item:
        raise HTTPException(status_code=422, detail="This WO has no materials to stage (no step assigned, or step has no materials)")

    staged_any = False
    moved_so_far: dict[str, float] = {}  # per item, across this request's lines — multiple batches can share an item
    for line in payload.lines:
        qty = float(line.qty or 0)
        rr = req_by_item.get(str(line.item_id))
        if not rr:
            raise HTTPException(status_code=400, detail=f"Item {line.item_id} is not a material of this WO's step")

        # Warp beam: mount it on the MACHINE, not this WO. The whole physical beam
        # goes up (pcs, not kg — a partial warp makes no sense), it stays lotted,
        # and every WO that runs on the loom afterwards sees it. No shortfall cap.
        if rr.is_beam:
            if not line.batch_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Select which beam to mount for {rr.item_code or line.item_id}",
                )
            await beam_service.mount_beam(
                db, batch_id=line.batch_id, work_center_id=wo.work_center_id,
                qty=qty if qty > 0 else None, source_wo_id=wo.id,
                user=current_user.username,
            )
            staged_any = True
            continue

        if qty <= 0:
            continue
        # Cap top-up at the remaining shortfall so re-staging (or multiple batch
        # lines for the same item) can't double-count. Scan-to-stage sets
        # allow_overstage to move whole physical lots even past the step's need.
        already_moved = moved_so_far.get(str(line.item_id), 0.0)
        if payload.allow_overstage:
            move_qty = qty
        else:
            remaining = max(0.0, rr.required_qty - rr.staged - already_moved)
            if remaining <= 0:
                continue
            move_qty = min(qty, remaining)
        moved_so_far[str(line.item_id)] = already_moved + move_qty
        src = line.source_location_id or rr.source_location_id
        if not src:
            raise HTTPException(status_code=422, detail=f"No source location for {rr.item_code or line.item_id}")
        # Batch-tracked material (lot or beam) must be staged against a specific batch,
        # else the transfer hits the batch_key="" balance and corrupts batch stock.
        if rr.lot_tracked and not line.batch_id:
            raise HTTPException(
                status_code=400,
                detail=f"Select a lot/beam for {rr.item_code or line.item_id} — it is batch-tracked",
            )
        attrs = [str(a) for a in (line.attribute_value_ids or rr.attribute_value_ids or [])]

        # Two-sided transfer: out of source store, into the WO's input location.
        await stock_service.add_stock_entry(
            db, item_id=line.item_id, location_id=src, qty_change=-move_qty,
            reference_type="Staging", reference_id=str(wo.id),
            attribute_value_ids=[] if line.batch_id else attrs,
            batch_id=line.batch_id,
        )
        await stock_service.add_stock_entry(
            db, item_id=line.item_id, location_id=wo.input_location_id, qty_change=move_qty,
            reference_type="Staging", reference_id=str(wo.id),
            attribute_value_ids=[] if line.batch_id else attrs,
            batch_id=line.batch_id,
        )
        staged_any = True

    if not staged_any:
        raise HTTPException(status_code=400, detail="Nothing to stage")

    # Recompute and persist staging status.
    new_rows = await _wo_required_rows(db, wo, mo)
    wo.staging_status = _staging_status(new_rows)
    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="STAGE",
        entity_type="WORK_ORDER", entity_id=str(wo.id),
        details=f"Staged materials to WO '{wo.code}' (status {wo.staging_status})",
        changes={"lines": [{"item_id": str(l.item_id), "qty": l.qty} for l in payload.lines]},
    )
    await manager.broadcast({"type": "WORK_ORDER_UPDATE", "wo_id": str(wo.id), "status": wo.status})
    await manager.broadcast({"type": "STOCK_UPDATE"})

    result = await db.execute(
        select(WorkOrder).options(*_wo_options()).filter(WorkOrder.id == wo.id)
    )
    return result.scalars().first()


@router.post("/work-orders/{wo_id}/leftover-beam", response_model=BatchResponse)
async def create_leftover_beam(
    wo_id: str,
    payload: LeftoverBeamCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.edit')),
):
    """Re-lot leftover warp: move kg out of the WO input location's batch-less
    pool into a new trackable beam batch (born from this weaving WO)."""
    result = await db.execute(select(WorkOrder).filter(WorkOrder.id == wo_id))
    wo = result.scalars().first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    _require_wo_scope(current_user, await _wc_type(db, wo.work_center_id))
    if not wo.input_location_id:
        raise HTTPException(status_code=422, detail="Work Order has no input location")

    qty = float(payload.qty or 0)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be positive")

    item_res = await db.execute(select(Item).filter(Item.id == payload.item_id))
    item = item_res.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Available = batch-less pool only; batch stock (unmounted beams) is not eligible.
    pool_res = await db.execute(
        select(StockBalance.qty).where(
            StockBalance.item_id == payload.item_id,
            StockBalance.location_id == wo.input_location_id,
            StockBalance.variant_key == "",
            StockBalance.batch_key == "",
        )
    )
    pool = float(pool_res.scalar() or 0)
    if qty > pool + 1e-9:
        raise HTTPException(
            status_code=400,
            detail=f"Only {pool:g} available in the merged pool at the input location",
        )

    beam_number = (payload.beam_number or "").strip()
    if beam_number:
        dup = await db.execute(select(Batch.id).filter(Batch.batch_number == beam_number).limit(1))
        if dup.scalars().first():
            raise HTTPException(status_code=400, detail=f"Beam number '{beam_number}' already exists")
    else:
        beam_number = await generate_batch_number(db, prefix="BM")

    batch = Batch(
        batch_number=beam_number,
        item_id=payload.item_id,
        ends=payload.ends,
        source_wo_id=wo.id,
        notes=payload.notes or f"Leftover from {wo.code or wo.name}",
        created_by=current_user.username,
    )
    db.add(batch)
    await db.flush()

    # Same-location move: pool kg out, beam batch kg in.
    await stock_service.add_stock_entry(
        db, item_id=payload.item_id, location_id=wo.input_location_id, qty_change=-qty,
        reference_type="Leftover Beam", reference_id=str(wo.id),
        attribute_value_ids=[], batch_id=None,
    )
    await stock_service.add_stock_entry(
        db, item_id=payload.item_id, location_id=wo.input_location_id, qty_change=qty,
        reference_type="Leftover Beam", reference_id=str(wo.id),
        attribute_value_ids=[], batch_id=batch.id,
    )
    await db.commit()

    await audit_service.log_activity(
        db, current_user.id, "CREATE", "Batch", str(batch.id),
        details=f"Leftover beam {beam_number} ({qty:g}) from WO '{wo.code or wo.name}'",
    )
    await manager.broadcast({"type": "STOCK_UPDATE"})

    batch.item_code = item.code
    batch.item_name = item.name
    batch.remaining = qty
    batch.location_id = wo.input_location_id
    return batch


# ─────────────────────────────────────────────────────────────────────────────
# Beam mounts (loom-level warp)
#
# A warp beam is a machine resource: mounted on a loom, shared by every WO that
# runs there while it is up. These endpoints are keyed on the work center, never
# on a WO — that is the whole point of the model. See services/beam_service.py.
# ─────────────────────────────────────────────────────────────────────────────

def _mount_out(mount: BeamMount, remaining: float) -> BeamMountResponse:
    b, it, wc = mount.batch, mount.item, mount.work_center
    return BeamMountResponse(
        id=mount.id,
        batch_id=mount.batch_id,
        beam_number=b.batch_number if b else None,
        work_center_id=mount.work_center_id,
        work_center_code=(wc.code or wc.name) if wc else None,
        item_id=mount.item_id,
        item_code=it.code if it else None,
        item_name=it.name if it else None,
        location_id=mount.location_id,
        default_return_location_id=(it.default_source_location_id if it else None),
        ends=(b.ends if b and b.ends else (it.ends if it else None)),
        qty_mounted=float(mount.qty_mounted or 0),
        remaining=remaining,
        source_wo_id=mount.source_wo_id,
        mounted_at=mount.mounted_at,
        mounted_by=mount.mounted_by,
        dismounted_at=mount.dismounted_at,
        dismounted_by=mount.dismounted_by,
    )


@router.get("/work-centers/{wc_id}/beam-mounts", response_model=LoomBeamStatus)
async def get_loom_beam_status(
    wc_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """What warp is up on this loom right now — feeds the weaving monitor card."""
    wc = (await db.execute(select(WorkCenter).where(WorkCenter.id == wc_id))).scalars().first()
    if not wc:
        raise HTTPException(status_code=404, detail="Work center not found")
    mounts = await beam_service.active_mounts(db, wc.id)
    return LoomBeamStatus(
        work_center_id=wc.id,
        work_center_code=wc.code or wc.name,
        beam_slots=max(1, int(wc.beam_slots or 1)),
        mounted_pcs=sum(1 for _, q in mounts if q > 1e-9),
        total_remaining=sum(q for _, q in mounts),
        mounts=[_mount_out(m, q) for m, q in mounts],
    )


@router.post("/work-centers/{wc_id}/beam-mounts", response_model=BeamMountResponse)
async def mount_beam_on_loom(
    wc_id: str,
    payload: BeamMountCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.edit')),
):
    """Gait a beam onto a loom directly (no WO context needed)."""
    wc = (await db.execute(select(WorkCenter).where(WorkCenter.id == wc_id))).scalars().first()
    if not wc:
        raise HTTPException(status_code=404, detail="Work center not found")
    _require_wo_scope(current_user, wc.center_type)

    mount = await beam_service.mount_beam(
        db, batch_id=payload.batch_id, work_center_id=wc.id, qty=payload.qty,
        source_wo_id=payload.source_wo_id, user=current_user.username,
    )
    await db.commit()

    await audit_service.log_activity(
        db, user_id=current_user.id, action="MOUNT", entity_type="BEAM_MOUNT",
        entity_id=str(mount.id),
        details=f"Mounted beam on machine '{wc.code or wc.name}'",
        changes={"batch_id": str(payload.batch_id), "work_center_id": str(wc.id)},
    )
    await manager.broadcast({"type": "STOCK_UPDATE"})
    await manager.broadcast({"type": "WORK_ORDER_UPDATE"})

    for m, q in await beam_service.active_mounts(db, wc.id):
        if str(m.id) == str(mount.id):
            return _mount_out(m, q)
    return _mount_out(mount, 0.0)


@router.post("/beam-mounts/{mount_id}/dismount", response_model=BeamMountResponse)
async def dismount_beam_from_loom(
    mount_id: str,
    payload: BeamDismountPayload,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('beam.unmount')),
):
    """Take a beam off the loom. The remnant keeps its own lot and remaining kg —
    no re-lotting step. Optionally send it back to a store location."""
    mount = await beam_service.dismount_beam(
        db, mount_id, to_location_id=payload.to_location_id, user=current_user.username,
    )
    remaining = 0.0
    await db.commit()

    res = await db.execute(
        select(BeamMount)
        .options(joinedload(BeamMount.batch), joinedload(BeamMount.item))
        .where(BeamMount.id == mount.id)
    )
    fresh = res.unique().scalars().first()
    if fresh and fresh.location_id:
        bal = (await db.execute(
            select(StockBalance.qty).where(
                StockBalance.item_id == fresh.item_id,
                StockBalance.location_id == (payload.to_location_id or fresh.location_id),
                StockBalance.variant_key == "",
                StockBalance.batch_key == str(fresh.batch_id),
            )
        )).scalar()
        remaining = float(bal or 0)

    await audit_service.log_activity(
        db, user_id=current_user.id, action="DISMOUNT", entity_type="BEAM_MOUNT",
        entity_id=str(mount.id),
        details=f"Dismounted beam (remnant {remaining:g})",
        changes={"to_location_id": str(payload.to_location_id) if payload.to_location_id else None},
    )
    await manager.broadcast({"type": "STOCK_UPDATE"})
    await manager.broadcast({"type": "WORK_ORDER_UPDATE"})
    return _mount_out(fresh or mount, remaining)


@router.get("/work-orders/{wo_id}/beam-mounts", response_model=LoomBeamStatus)
async def get_wo_beam_status(
    wo_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """Beam readiness for a WO = the readiness of the machine it runs on."""
    wo = (await db.execute(select(WorkOrder).where(WorkOrder.id == wo_id))).scalars().first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    if not wo.work_center_id:
        return LoomBeamStatus(work_center_id=uuid.UUID(int=0))
    return await get_loom_beam_status(str(wo.work_center_id), db, current_user)


@router.delete("/work-orders/{wo_id}")
async def delete_work_order(
    wo_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(require_permission('work_order.delete')),
):
    result = await db.execute(select(WorkOrder).filter(WorkOrder.id == wo_id))
    wo = result.scalars().first()
    if not wo:
        raise HTTPException(status_code=404, detail="Work Order not found")
    _require_wo_scope(current_user, await _wc_type(db, wo.work_center_id))
    label = wo.code or wo.name
    await db.delete(wo)
    await db.commit()
    await audit_service.log_activity(
        db, user_id=current_user.id, action="DELETE",
        entity_type="WORK_ORDER", entity_id=wo_id,
        details=f"Deleted Work Order '{label}'"
    )
    return {"status": "success"}
