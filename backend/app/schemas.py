from pydantic import BaseModel
from pydantic import ConfigDict
from uuid import UUID
from datetime import datetime, date
from typing import Optional, Any

class VariantCreate(BaseModel):
    name: str
    category: str | None = None

class VariantResponse(VariantCreate):
    id: UUID
    item_id: UUID

    class Config:
        from_attributes = True

class AttributeValueCreate(BaseModel):
    value: str

class AttributeValueUpdate(BaseModel):
    value: str

class AttributeValueResponse(AttributeValueCreate):
    id: UUID
    attribute_id: UUID

    class Config:
        from_attributes = True

class AttributeCreate(BaseModel):
    name: str
    values: list[AttributeValueCreate] = []

class AttributeUpdate(BaseModel):
    name: str

class AttributeResponse(AttributeCreate):
    id: UUID
    is_system: bool = False
    system_role: str | None = None
    values: list[AttributeValueResponse] = []

    class Config:
        from_attributes = True

class SizeResponse(BaseModel):
    id: UUID
    name: str
    sort_order: int

    class Config:
        from_attributes = True

class BOMSizeCreate(BaseModel):
    size_id: UUID | None = None
    label: str | None = None
    target_measurement: float | None = None
    measurement_min: float | None = None
    measurement_max: float | None = None

class BOMSizeResponse(BaseModel):
    id: UUID
    size_id: UUID | None = None
    label: str | None = None
    size_name: str | None = None
    target_measurement: float | None = None
    measurement_min: float | None = None
    measurement_max: float | None = None
    sort_order: int = 0

    class Config:
        from_attributes = True

class BOMLineCreate(BaseModel):
    item_code: str
    attribute_value_ids: list[UUID] = []
    qty: float = 0.0
    percentage: float = 0.0
    source_location_code: str | None = None
    bom_operation_sequence: Optional[int] = None

class BOMLineResponse(BaseModel):
    id: UUID
    item_id: UUID
    item_code: str | None = None
    item_name: str | None = None
    attribute_value_ids: list[UUID] = [] # We'll populate this in the API
    qty: float
    percentage: float = 0.0
    source_location_id: UUID | None = None
    bom_operation_id: UUID | None = None

    class Config:
        from_attributes = True

class BOMOperationCreate(BaseModel):
    operation_id: Optional[UUID] = None
    work_center_id: Optional[UUID] = None
    sequence: int = 10
    time_minutes: float = 0.0

class BOMOperationResponse(BaseModel):
    id: UUID
    operation_id: Optional[UUID] = None
    work_center_id: Optional[UUID] = None
    sequence: int
    time_minutes: float
    operation_name: Optional[str] = None
    work_center_type: Optional[str] = None

    class Config:
        from_attributes = True

    @classmethod
    def model_validate(cls, obj, **kwargs):
        instance = super().model_validate(obj, **kwargs)
        if hasattr(obj, 'operation') and obj.operation:
            instance.operation_name = obj.operation.name
        if hasattr(obj, 'work_center') and obj.work_center:
            instance.work_center_type = obj.work_center.center_type
        return instance

class BOMCreate(BaseModel):
    code: str
    description: str | None = None
    item_code: str
    attribute_value_ids: list[UUID] = []
    qty: float = 1.0
    tolerance_percentage: float = 0.0
    size_mode: str = 'sized'
    lines: list[BOMLineCreate]
    operations: list[BOMOperationCreate] = []
    sizes: list[BOMSizeCreate] = []
    kerapatan_picks: float | None = None
    kerapatan_unit: str | None = None
    sisir_no: int | None = None
    pemakaian_obat: str | None = None
    pembuatan_sample_oleh: str | None = None
    sample_photo_url: str | None = None
    design_file_url: str | None = None
    customer_id: Optional[UUID] = None
    work_center_id: Optional[UUID] = None
    berat_bahan_mateng: float | None = None
    berat_bahan_mentah_pelesan: float | None = None
    mesin_lebar: float | None = None
    mesin_panjang_tulisan: float | None = None
    mesin_panjang_tarikan: float | None = None
    mesin_panjang_tarikan_bandul_1kg: float | None = None
    mesin_panjang_tarikan_bandul_9kg: float | None = None
    celup_lebar: float | None = None
    celup_panjang_tulisan: float | None = None
    celup_panjang_tarikan: float | None = None
    celup_panjang_tarikan_bandul_1kg: float | None = None
    celup_panjang_tarikan_bandul_9kg: float | None = None

class BOMResponse(BaseModel):
    id: UUID
    code: str
    description: str | None
    item_id: UUID
    item_code: str | None = None
    item_name: str | None = None
    attribute_value_ids: list[UUID] = [] # We'll populate this in the API
    qty: float
    tolerance_percentage: float = 0.0
    size_mode: str = 'sized'
    active: bool
    lines: list[BOMLineResponse]
    operations: list[BOMOperationResponse] = []
    sizes: list[BOMSizeResponse] = []
    kerapatan_picks: float | None = None
    kerapatan_unit: str | None = None
    sisir_no: int | None = None
    pemakaian_obat: str | None = None
    pembuatan_sample_oleh: str | None = None
    sample_photo_url: str | None = None
    design_file_url: str | None = None
    customer_id: Optional[UUID] = None
    customer_name: Optional[str] = None
    work_center_id: Optional[UUID] = None
    work_center_name: Optional[str] = None
    berat_bahan_mateng: float | None = None
    berat_bahan_mentah_pelesan: float | None = None
    mesin_lebar: float | None = None
    mesin_panjang_tulisan: float | None = None
    mesin_panjang_tarikan: float | None = None
    mesin_panjang_tarikan_bandul_1kg: float | None = None
    mesin_panjang_tarikan_bandul_9kg: float | None = None
    celup_lebar: float | None = None
    celup_panjang_tulisan: float | None = None
    celup_panjang_tarikan: float | None = None
    celup_panjang_tarikan_bandul_1kg: float | None = None
    celup_panjang_tarikan_bandul_9kg: float | None = None

    class Config:
        from_attributes = True

class BOMSummaryResponse(BaseModel):
    """Lightweight BOM list payload for the BOM page. Identical to BOMResponse
    except `operations` (an array) is collapsed to `operation_count` — the list
    only shows an op count, never the routing rows. Line/size shapes are
    unchanged so every consumer reads the same fields."""
    is_root: bool = True  # True if item_id not used as a component in any other BOM
    id: UUID
    code: str
    description: str | None
    item_id: UUID
    item_code: str | None = None
    item_name: str | None = None
    attribute_value_ids: list[UUID] = []
    qty: float
    tolerance_percentage: float = 0.0
    size_mode: str = 'sized'
    active: bool
    lines: list[BOMLineResponse]
    operation_count: int = 0
    sizes: list[BOMSizeResponse] = []
    kerapatan_picks: float | None = None
    kerapatan_unit: str | None = None
    sisir_no: int | None = None
    pemakaian_obat: str | None = None
    pembuatan_sample_oleh: str | None = None
    sample_photo_url: str | None = None
    design_file_url: str | None = None
    customer_id: Optional[UUID] = None
    customer_name: Optional[str] = None
    work_center_id: Optional[UUID] = None
    work_center_name: Optional[str] = None
    berat_bahan_mateng: float | None = None
    berat_bahan_mentah_pelesan: float | None = None
    mesin_lebar: float | None = None
    mesin_panjang_tulisan: float | None = None
    mesin_panjang_tarikan: float | None = None
    mesin_panjang_tarikan_bandul_1kg: float | None = None
    mesin_panjang_tarikan_bandul_9kg: float | None = None
    celup_lebar: float | None = None
    celup_panjang_tulisan: float | None = None
    celup_panjang_tarikan: float | None = None
    celup_panjang_tarikan_bandul_1kg: float | None = None
    celup_panjang_tarikan_bandul_9kg: float | None = None

    class Config:
        from_attributes = True

class BOMSummaryPageResponse(BaseModel):
    items: list[BOMSummaryResponse]
    total: int

class BOMLineTreeResponse(BOMLineResponse):
    sub_bom: Optional["BOMTreeResponse"] = None

    class Config:
        from_attributes = True

class BOMTreeResponse(BOMResponse):
    lines: list[BOMLineTreeResponse] = []

    class Config:
        from_attributes = True

BOMLineTreeResponse.model_rebuild()
BOMTreeResponse.model_rebuild()

class BOMUpdate(BaseModel):
    description: str | None = None
    qty: float | None = None
    tolerance_percentage: float | None = None
    active: bool | None = None
    size_mode: str | None = None
    attribute_value_ids: list[UUID] | None = None
    lines: list[BOMLineCreate] | None = None
    operations: list[BOMOperationCreate] | None = None
    sizes: list[BOMSizeCreate] | None = None
    customer_id: Optional[UUID] = None
    work_center_id: Optional[UUID] = None
    kerapatan_picks: float | None = None
    kerapatan_unit: str | None = None
    sisir_no: int | None = None
    pemakaian_obat: str | None = None
    pembuatan_sample_oleh: str | None = None
    berat_bahan_mateng: float | None = None
    berat_bahan_mentah_pelesan: float | None = None
    mesin_lebar: float | None = None
    mesin_panjang_tulisan: float | None = None
    mesin_panjang_tarikan: float | None = None
    mesin_panjang_tarikan_bandul_1kg: float | None = None
    mesin_panjang_tarikan_bandul_9kg: float | None = None
    celup_lebar: float | None = None
    celup_panjang_tulisan: float | None = None
    celup_panjang_tarikan: float | None = None
    celup_panjang_tarikan_bandul_1kg: float | None = None
    celup_panjang_tarikan_bandul_9kg: float | None = None


class MOCompletionItemCreate(BaseModel):
    item_id: UUID
    qty_used: float

class MOCompletionItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    item_id: UUID
    item_code: str | None = None
    item_name: str | None = None
    qty_used: float

class ConsumedLot(BaseModel):
    batch_id: UUID
    qty: float                          # amount consumed from this specific lot

class MOCompletionCreate(BaseModel):
    qty_completed: float
    operator_name: str | None = None
    notes: str | None = None
    work_center_id: UUID | None = None
    work_order_id: UUID | None = None
    actual_items: list[MOCompletionItemCreate] = []
    beam_number: str | None = None      # lot-tracked/beam output: batch number (blank = auto-generate)
    beam_batch_id: UUID | None = None   # legacy single input batch (kept for compat)
    consumed_batches: list[UUID] = []   # input batches to consume from, matched to lines by item (single lot per item)
    consumed_lots: list[ConsumedLot] = []   # multi-lot input consumption with explicit per-lot qty (dyeing greige substrate);
                                             # authoritatively deducts these lots and overrides the BOM% deduction for their items
    output_location_id: UUID | None = None  # putaway override: books output here instead of the WO's output location

class MOCompletionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    mo_id: UUID
    work_order_id: UUID | None = None
    qty_completed: float
    operator_name: str | None = None
    notes: str | None = None
    work_center_id: UUID | None = None
    work_center_name: str | None = None
    actual_items: list[MOCompletionItemResponse] = []
    created_at: datetime
    output_batch_id: UUID | None = None
    output_batch_number: str | None = None
    rejected: bool = False
    reject_reason: str | None = None
    rejected_at: datetime | None = None
    rejected_by: str | None = None

class BatchReject(BaseModel):
    """QC-reject a produced lot (from the Lot Management page)."""
    reason: str | None = None

class MOCompletionReject(BaseModel):
    """Completion-level reject (API/un-lotted outputs; lot page uses /batches/{id}/reject)."""
    reason: str | None = None
    # Legacy completions (pre output_batch_id link) can name the lot explicitly
    output_batch_id: UUID | None = None

class ManufacturingOrderCreate(BaseModel):
    code: str
    bom_id: UUID
    location_code: str | None = None
    source_location_code: str | None = None
    sales_order_id: UUID | None = None
    qty: float
    production_run_id: UUID | None = None
    bom_size_id: UUID | None = None
    target_start_date: datetime | None = None
    target_end_date: datetime | None = None
    create_nested: bool = False # Prompt user to create child MOs

class MOAttributeUpdate(BaseModel):
    attribute_value_ids: list[UUID]

class MOPutawayUpdate(BaseModel):
    location_id: UUID | None = None   # null clears the planned putaway bin

class BatchConsumptionInMO(BaseModel):
    input_batch_id: UUID
    input_batch_number: str
    output_batch_id: Optional[UUID] = None
    output_batch_number: Optional[str] = None
    qty_consumed: float

class ManufacturingOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    code: str
    bom_id: UUID
    item_id: UUID
    item_code: str | None = None
    item_name: str | None = None
    item_ends: int | None = None  # beam warp-ends (utas); authoritative default for beam WO planning
    sales_order_id: UUID | None = None
    sales_order_code: str | None = None
    parent_mo_id: UUID | None = None
    production_run_id: UUID | None = None
    bom_size_id: UUID | None = None
    bom_size_snapshot: dict | None = None
    is_shared_component: bool = False
    attribute_value_ids: list[UUID] = []
    location_id: UUID | None = None
    source_location_id: UUID | None = None
    planned_putaway_location_id: UUID | None = None
    planned_putaway_location_name: str | None = None
    qty: float
    status: str
    target_start_date: datetime | None
    target_end_date: datetime | None
    actual_start_date: datetime | None
    actual_end_date: datetime | None
    created_at: datetime
    is_material_available: bool = True
    qty_completed_total: float = 0.0
    required_mo_ids: list[UUID] = []  # IDs of shared component MOs this MO depends on (populated in API)

    bom: Optional[BOMResponse] = None
    child_mos: list['ManufacturingOrderResponse'] = []
    work_orders: list['WorkOrderResponse'] = []
    batch_trace: list[BatchConsumptionInMO] = []
    completions: list[MOCompletionResponse] = []

# Forward refs resolved after WorkOrderResponse is defined below

class PaginatedManufacturingOrderResponse(BaseModel):
    items: list[ManufacturingOrderResponse]
    total: int
    page: int
    size: int

# --- Production Run Schemas ---

class PRBomSizeEntry(BaseModel):
    bom_size_id: UUID
    qty: float

class PRBomEntryCreate(BaseModel):
    bom_id: UUID
    sizes: list[PRBomSizeEntry] = []
    total_qty: float | None = None
    attribute_value_ids: list[UUID] = []
    force_create: bool = False

class PRBomEntrySizeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    bom_size_id: UUID
    qty: float

class PRBomEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    bom_id: UUID
    total_qty: float | None = None
    attribute_value_ids: list[UUID] = []
    force_create: bool = False
    bom: Optional['BOMResponse'] = None
    sizes: list[PRBomEntrySizeResponse] = []

# Kept for backward compatibility (used by SO-page deep-link flow)
class ProductionRunSizeEntry(BaseModel):
    bom_size_id: UUID
    qty: float

class ProductionRunCreate(BaseModel):
    code: str
    bom_entries: list[PRBomEntryCreate]
    location_code: str | None = None
    source_location_code: str | None = None
    sales_order_id: UUID | None = None
    target_start_date: datetime | None = None
    target_end_date: datetime | None = None
    notes: str | None = None

class ProductionRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    code: str
    bom_id: UUID | None = None
    sales_order_id: UUID | None = None
    sales_order_code: str | None = None
    location_id: UUID | None = None
    source_location_id: UUID | None = None
    status: str
    notes: str | None = None
    target_start_date: datetime | None = None
    target_end_date: datetime | None = None
    actual_start_date: datetime | None = None
    actual_end_date: datetime | None = None
    created_at: datetime
    bom: Optional['BOMResponse'] = None
    bom_entries: list[PRBomEntryResponse] = []
    manufacturing_orders: list['ManufacturingOrderResponse'] = []

class PaginatedProductionRunResponse(BaseModel):
    items: list[ProductionRunResponse]
    total: int
    page: int
    size: int

class PRMOContribution(BaseModel):
    mo_id: UUID
    mo_code: str
    mo_qty: float
    required_qty: float

class PRMaterialRequirementItem(BaseModel):
    item_id: UUID
    item_code: str
    item_name: str
    uom: str
    attribute_value_ids: list[UUID]
    location_id: UUID | None = None        # null = plant-wide (location-agnostic netting)
    total_required: float
    qty_available: float
    shortfall: float
    mo_contributions: list[PRMOContribution]

# ── Booking Stock (material availability across all ongoing MOs) ──────────────
class BookingDemandMO(BaseModel):
    """One ongoing MO's outstanding demand for a component item."""
    mo_id: UUID
    mo_code: str
    mo_qty: float
    required_qty: float

class BookingSupplyMO(BaseModel):
    """One ongoing MO whose outstanding output will supply (produce) this item."""
    mo_id: UUID
    mo_code: str
    mo_qty: float
    incoming_qty: float

class BookingStockRow(BaseModel):
    item_id: UUID
    item_code: str
    item_name: str
    uom: str
    attribute_value_ids: list[UUID]
    location_id: UUID | None = None        # null = plant-wide (location-agnostic netting)
    location_name: str = "Plant-wide"
    qty_on_hand: float       # current physical balance
    qty_required: float      # outstanding demand from ongoing MOs
    qty_incoming: float       # scheduled receipts from in-flight production MOs
    qty_net_free: float      # on_hand + incoming - required  (negative = shortfall)
    demand_mos: list[BookingDemandMO]
    supply_mos: list[BookingSupplyMO]

class PaginatedBookingStockResponse(BaseModel):
    items: list[BookingStockRow]
    total: int
    page: int
    size: int

# ── Creation netting preview (dry-run; shows where each component nets from) ───
class NettingPreviewNode(BaseModel):
    """One node in the dry-run explosion of a PR/MO about to be created.

    Root nodes (is_root=True) are the finished goods — always produced at full
    qty (decision MAKE_ROOT), no netting. Component nodes carry the net-free
    breakdown and the resolved location the net was calculated FROM."""
    level: int                          # 0 = root FG, 1 = direct component, ...
    is_root: bool
    item_id: UUID
    item_code: str
    item_name: str
    uom: str
    net_from_location_id: UUID | None = None
    net_from_location_name: str
    gross_required: float               # qty x percentage / 100 (no netting)
    on_hand: float                      # leaf-rolled physical stock at the location
    incoming: float                     # other open MOs' scheduled output
    required_other: float               # other open MOs' demand (excl. this unit)
    net_free: float                     # on_hand + incoming - required_other
    net_qty: float                      # qty actually made after netting
    decision: str                       # MAKE_ROOT | MAKE | RESIZE | SKIP | FORCED

class ProductionRunPreviewRequest(BaseModel):
    bom_entries: list[PRBomEntryCreate]
    location_code: str | None = None
    source_location_code: str | None = None
    exclude_pr_id: UUID | None = None   # set when re-previewing an existing PR

class MOPreviewRequest(BaseModel):
    bom_id: UUID
    qty: float
    location_code: str | None = None
    source_location_code: str | None = None
    create_nested: bool = True

class LocationCreate(BaseModel):
    code: str
    name: str
    parent_id: UUID | None = None        # null = top-level warehouse/area

class LocationUpdate(BaseModel):
    name: str | None = None
    parent_id: UUID | None = None        # explicit null = move to top level

class LocationResponse(BaseModel):
    id: UUID
    code: str
    name: str
    parent_id: UUID | None = None
    parent_name: str | None = None
    has_children: bool = False
    location_type: str = 'bin'
    system_code: str | None = None
    full_path: str = ''

    class Config:
        from_attributes = True

# --- Work Order (operation step) Schemas ---

class WorkOrderCreate(BaseModel):
    manufacturing_order_id: UUID
    sequence: int = 1
    name: str | None = None
    work_center_id: UUID | None = None
    bom_operation_id: UUID | None = None
    input_location_id: UUID | None = None
    output_location_id: UUID | None = None
    next_destination_location_id: UUID | None = None
    next_destination_work_center_id: UUID | None = None
    qty: float | None = None
    ends: int | None = None
    planned_duration_hours: float | None = None
    notes: str | None = None
    target_start_date: datetime | None = None
    target_end_date: datetime | None = None

class WorkOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    manufacturing_order_id: UUID
    sequence: int
    code: str | None = None
    name: str
    work_center_id: UUID | None = None
    work_center_name: str | None = None
    work_center_type: str | None = None
    bom_operation_id: UUID | None = None
    staging_status: str = "NOT_STAGED"
    planned_recipe_id: UUID | None = None
    input_location_id: UUID | None = None
    output_location_id: UUID | None = None
    input_location: LocationResponse | None = None
    output_location: LocationResponse | None = None
    next_destination_location_id: UUID | None = None
    next_destination_work_center_id: UUID | None = None
    next_destination_location_name: str | None = None
    next_destination_work_center_name: str | None = None
    qty: float | None = None
    ends: int | None = None
    qty_completed_total: float = 0.0
    status: str
    planned_duration_hours: float | None = None
    actual_duration_hours: float | None = None
    notes: str | None = None
    # Over-assignment warning fields — set at endpoint level, not from ORM
    warning: str | None = None
    total_assigned: float | None = None
    mo_qty: float | None = None
    target_start_date: datetime | None = None
    target_end_date: datetime | None = None
    actual_start_date: datetime | None = None
    actual_end_date: datetime | None = None
    card_printed_at: datetime | None = None
    labels_printed_at: datetime | None = None
    created_at: datetime


class WORequiredMaterial(BaseModel):
    """One material a WO must stage to its input location (its step's share)."""
    item_id: UUID
    item_code: str | None = None
    item_name: str | None = None
    attribute_value_ids: list[UUID] = []
    required_qty: float
    source_location_id: UUID | None = None
    source_location_name: str | None = None
    on_hand: float = 0.0        # available at source location (rolled up across leaf spots)
    staged: float = 0.0         # already staged to this WO's input location
    shortfall: float = 0.0      # max(0, required - staged)
    lot_tracked: bool = False
    suggested_batch_id: UUID | None = None   # traced from this MO's BEAMING WO output; still overridable


class WOStageLine(BaseModel):
    item_id: UUID
    qty: float
    source_location_id: UUID | None = None      # defaults to the line's resolved source
    batch_id: UUID | None = None                # required for lot-tracked materials
    attribute_value_ids: list[UUID] = []


class WOStagePayload(BaseModel):
    lines: list[WOStageLine]
    # Scan-to-stage (greige bags → dyeing) grabs whole physical lots and may
    # exceed the step's required qty. When true, skip the shortfall cap so every
    # scanned lot moves in full; the UI warns the operator it's over-required.
    allow_overstage: bool = False


class PutawayBinOption(BaseModel):
    """One candidate destination bin under a WO's output location."""
    id: UUID
    code: str
    name: str
    full_path: str
    item_on_hand: float = 0.0    # output item already sitting in this bin
    total_on_hand: float = 0.0   # any stock in this bin (0 = empty)


class PutawaySuggestionResponse(BaseModel):
    suggested_location_id: UUID | None = None
    reason: str | None = None    # 'configured' | 'same_item' | 'empty_bin' | 'first_bin'
    bins: list[PutawayBinOption] = []


# ── Flat Work Order list (dedicated GET /work-orders endpoint) ──────────────

class WorkOrderCompletionItemFlat(BaseModel):
    item_id: str
    item_code: str | None = None
    qty_used: float


class WorkOrderCompletionFlat(BaseModel):
    id: str
    qty_completed: float
    operator_name: str | None = None
    work_center_name: str | None = None
    created_at: datetime | None = None
    notes: str | None = None
    actual_items: list[WorkOrderCompletionItemFlat] = []
    rejected: bool = False
    reject_reason: str | None = None


class WorkOrderFlatResponse(BaseModel):
    id: str
    code: str | None = None
    sequence: int
    name: str
    status: str
    qty: float | None = None
    qty_completed_total: float | None = None
    planned_duration_hours: float | None = None
    actual_duration_hours: float | None = None
    target_start_date: datetime | None = None
    target_end_date: datetime | None = None
    actual_start_date: datetime | None = None
    actual_end_date: datetime | None = None
    card_printed_at: datetime | None = None
    labels_printed_at: datetime | None = None
    notes: str | None = None
    created_at: datetime | None = None
    work_center_id: str | None = None
    work_center_name: str | None = None
    work_center_type: str | None = None
    input_location: LocationResponse | None = None
    output_location: LocationResponse | None = None
    next_destination_location_id: str | None = None
    next_destination_work_center_id: str | None = None
    next_destination_location_name: str | None = None
    next_destination_work_center_name: str | None = None
    ends: int | None = None
    staging_status: str = "NOT_STAGED"
    bom_operation_id: str | None = None
    mo_id: str
    mo_code: str
    item_name: str
    item_id: str
    completions: list[WorkOrderCompletionFlat] = []
    bom_line_item_ids: list[str] = []


class WorkOrderFlatPageResponse(BaseModel):
    items: list[WorkOrderFlatResponse]
    total: int
    page: int
    size: int


class WorkOrderMarkPrintedBulk(BaseModel):
    ids: list[str] = []
    kind: str = "card"   # "card" (Kartu Kerja) | "labels" (bag labels)


# Resolve forward references now that all referenced schemas are defined
ManufacturingOrderResponse.update_forward_refs()

class ItemCreate(BaseModel):
    code: str
    name: str
    uom: str
    category_id: UUID | None = None
    attribute_ids: list[UUID] = []
    source_sample_id: UUID | None = None
    source_color_id: UUID | None = None
    weight_per_unit: float | None = None
    weight_unit: str | None = None
    packaging_factor_ids: list[UUID] = []
    ends: int | None = None
    lot_tracked: bool = False
    min_stock_level: float | None = None
    default_source_location_id: UUID | None = None
    default_putaway_location_id: UUID | None = None


class ItemUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    uom: str | None = None
    category_id: UUID | None = None
    attribute_ids: list[UUID] | None = None
    source_sample_id: UUID | None = None
    source_color_id: UUID | None = None
    active: bool | None = None
    weight_per_unit: float | None = None
    weight_unit: str | None = None
    packaging_factor_ids: list[UUID] | None = None
    ends: int | None = None
    lot_tracked: bool | None = None
    min_stock_level: float | None = None
    default_source_location_id: UUID | None = None
    default_putaway_location_id: UUID | None = None


class ItemResponse(BaseModel):
    id: UUID
    code: str
    name: str
    uom: str
    active: bool
    category_id: UUID | None = None
    category_path: list[str] = []
    attribute_ids: list[UUID] = []
    source_sample_id: UUID | None = None
    source_color_id: UUID | None = None
    source_sample_code: str | None = None
    source_color_name: str | None = None
    weight_per_unit: float | None = None
    weight_unit: str | None = None
    packaging_factor_ids: list[UUID] = []
    ends: int | None = None
    lot_tracked: bool = False
    min_stock_level: float | None = None
    default_source_location_id: UUID | None = None
    default_putaway_location_id: UUID | None = None

    class Config:
        from_attributes = True

class PaginatedItemResponse(BaseModel):
    items: list[ItemResponse]
    total: int
    page: int
    size: int

class StockEntryCreate(BaseModel):
    item_code: str
    location_code: str
    attribute_value_ids: list[UUID] = []
    qty: float
    reference_type: str = "manual"
    reference_id: str = "manual_entry"
    qty_cones: int | None = None
    qty_boxes: int | None = None
    qty_drums: int | None = None
    batch_id: UUID | None = None

class StockTransferCreate(BaseModel):
    item_id: UUID
    from_location_id: UUID
    to_location_id: UUID
    qty: float
    batch_id: UUID | None = None
    attribute_value_ids: list[UUID] = []
    qty_cones: int | None = None
    qty_boxes: int | None = None
    qty_drums: int | None = None

class StockLedgerResponse(BaseModel):
    id: UUID
    item_id: UUID
    item_name: str = ""
    item_code: str = ""
    item_uom: str = ""
    attribute_value_ids: list[UUID] = []
    location_id: UUID
    location_name: str = ""
    qty_change: float
    qty_cones_change: int | None = None
    qty_boxes_change: int | None = None
    qty_drums_change: int | None = None
    reference_type: str
    reference_id: str
    batch_id: UUID | None = None
    batch_number: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True

class PaginatedStockLedgerResponse(BaseModel):
    items: list[StockLedgerResponse]
    total: int
    page: int
    size: int
    # Aggregates over the full filtered set (not just the current page).
    total_in: float = 0
    total_out: float = 0
    # Distinct reference types across the whole ledger — powers the filter dropdown.
    reference_types: list[str] = []

class StockBalanceResponse(BaseModel):
    item_id: UUID
    item_name: str = ""
    item_code: str = ""
    item_uom: str = ""
    item_ends: int | None = None
    item_category_id: UUID | None = None
    item_category_name: str | None = None
    attribute_value_ids: list[UUID] = []
    location_id: UUID
    location_name: str = ""
    qty: float
    qty_cones: int = 0
    qty_boxes: int = 0
    qty_drums: int = 0
    batch_key: str = ""
    batch_number: str | None = None

class UOMCreate(BaseModel):
    name: str

class UOMFactorCreate(BaseModel):
    to_uom_id: UUID
    value: float

class UOMFactorResponse(BaseModel):
    id: UUID
    from_uom_id: UUID
    to_uom_id: UUID
    from_uom_name: str = ''
    to_uom_name: str = ''
    value: float

    class Config:
        from_attributes = True

class UOMResponse(UOMCreate):
    id: UUID
    is_system: bool = False
    factors: list[UOMFactorResponse] = []

    class Config:
        from_attributes = True

class CategoryCreate(BaseModel):
    name: str
    parent_id: UUID | None = None


class CategoryResponse(BaseModel):
    id: UUID
    name: str
    parent_id: UUID | None
    level: int
    path_names: list[str]
    is_system: bool = False

    class Config:
        from_attributes = True

class WorkCenterCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    cost_per_hour: float = 0.0
    center_type: str = "GENERAL"
    input_location_id: UUID | None = None
    output_location_id: UUID | None = None
    parent_id: UUID | None = None

class WorkCenterResponse(BaseModel):
    id: UUID
    code: str
    name: str
    description: str | None = None
    cost_per_hour: float = 0.0
    center_type: str = "GENERAL"
    input_location_id: UUID | None = None
    output_location_id: UUID | None = None
    parent_id: UUID | None = None
    input_location: LocationResponse | None = None
    output_location: LocationResponse | None = None
    working_weekdays: list[int] | None = None

    class Config:
        from_attributes = True

class OperationCreate(BaseModel):
    code: str
    name: str
    description: str | None = None

class OperationResponse(OperationCreate):
    id: UUID
    is_system: bool = False

    class Config:
        from_attributes = True

# --- Partner (Customer/Supplier) Schemas ---

class PartnerCreate(BaseModel):
    name: str
    address: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    email: Optional[str] = None
    type: str # CUSTOMER or SUPPLIER
    active: bool = True

class PartnerUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    email: Optional[str] = None
    active: Optional[bool] = None

class PartnerResponse(PartnerCreate):
    id: UUID
    class Config:
        from_attributes = True

class PaginatedPartnerResponse(BaseModel):
    items: list[PartnerResponse]
    total: int
    page: int
    size: int

# --- Purchase Order (Outgoing) Schemas ---

class PurchaseOrderLineCreate(BaseModel):
    item_id: UUID
    qty: float
    unit_price: float | None = None
    due_date: datetime | None = None
    attribute_value_ids: list[UUID] = []

class PurchaseOrderLineResponse(PurchaseOrderLineCreate):
    id: UUID
    qty_received: float = 0
    attribute_value_ids: list[UUID] = []
    item_name: str | None = None
    item_code: str | None = None
    item_uom: str | None = None
    class Config:
        from_attributes = True

class PurchaseOrderCreate(BaseModel):
    po_number: str
    supplier_id: UUID
    target_location_id: UUID | None = None
    order_date: datetime | None = None
    ssn: str | None = None
    rate_mode: str | None = "kurs_pajak"
    kurs_pajak: str | None = None
    ktbi: str | None = None
    code: str | None = None
    payment_term: str | None = None
    category: str | None = None
    vat_percent: float | None = 11
    discount: float | None = 0
    notes: str | None = None
    lines: list[PurchaseOrderLineCreate]

# --- Goods Receipt Schemas ---

class GoodsReceiptLineCreate(BaseModel):
    po_line_id: UUID
    qty_received: float
    qty_boxes: int | None = None
    qty_cones: int | None = None  # raw material packaging
    qty_drums: int | None = None  # chemical/dye packaging
    batch_id: UUID | None = None
    vendor_lot: str | None = None  # supplier's lot number; same supplier+item+lot merges into the existing internal lot, else one is auto-generated

class GoodsReceiptCreate(BaseModel):
    receipt_date: datetime | None = None
    notes: str | None = None
    location_id: UUID | None = None  # receiving warehouse; falls back to PO target location
    delivery_note_number: str | None = None  # supplier Surat Jalan no.
    delivery_note_date: date | None = None    # date on the supplier DN
    lines: list[GoodsReceiptLineCreate]

class GoodsReceiptLineResponse(BaseModel):
    id: UUID
    po_line_id: UUID
    item_id: UUID
    item_name: str | None = None
    item_code: str | None = None
    item_uom: str | None = None
    qty_received: float
    qty_boxes: int | None = None
    qty_cones: int | None = None
    qty_drums: int | None = None
    batch_id: UUID | None = None
    vendor_lot: str | None = None    # supplier's lot reference
    internal_lot: str | None = None  # system-generated internal batch number
    class Config:
        from_attributes = True

class GoodsReceiptResponse(BaseModel):
    id: UUID
    po_id: UUID
    location_id: UUID | None = None
    receipt_date: datetime
    notes: str | None = None
    delivery_note_number: str | None = None
    delivery_note_date: date | None = None
    delivery_note_url: str | None = None
    created_at: datetime
    lines: list[GoodsReceiptLineResponse] = []
    class Config:
        from_attributes = True

class PurchaseOrderResponse(PurchaseOrderCreate):
    supplier_id: UUID | None = None  # legacy POs predating the required-supplier constraint have no supplier
    id: UUID
    status: str
    lines: list[PurchaseOrderLineResponse]
    receipts: list[GoodsReceiptResponse] = []
    created_at: datetime
    class Config:
        from_attributes = True

# --- Sales Schemas ---

class SalesOrderLineCreate(BaseModel):
    item_id: UUID
    qty: float
    due_date: datetime | None = None
    internal_confirmation_date: datetime | None = None
    ket_stock: str | None = None
    qty_kg: float | None = None
    qty2: float | None = None
    uom2: str | None = None
    uom2_factor: float | None = None
    attribute_value_ids: list[UUID] = []
    bom_size_id: UUID | None = None

class SalesOrderLineResponse(SalesOrderLineCreate):
    id: UUID
    attribute_value_ids: list[UUID] = []
    bom_size_id: UUID | None = None
    item_name: str | None = None
    item_code: str | None = None

    class Config:
        from_attributes = True

class SalesOrderCreate(BaseModel):
    po_number: str
    customer_po_ref: str | None = None
    customer_name: str
    order_date: datetime | None = None
    lines: list[SalesOrderLineCreate]

class SalesOrderUpdate(BaseModel):
    po_number: str
    customer_po_ref: str | None = None
    customer_name: str
    order_date: datetime | None = None
    notes: str | None = None
    lines: list[SalesOrderLineCreate]

class SalesOrderResponse(BaseModel):
    id: UUID
    po_number: str
    customer_po_ref: str | None = None
    customer_name: str
    order_date: datetime
    status: str
    delivered_at: datetime | None = None
    lines: list[SalesOrderLineResponse]
    created_at: datetime
    class Config:
        from_attributes = True

# --- Sample Request Schemas ---

class SampleColorCreate(BaseModel):
    name: str
    is_repeat: bool = False
    order: int = 0

class SampleColorResponse(BaseModel):
    id: UUID
    name: str
    is_repeat: bool = False
    order: int = 0
    status: str = "PENDING"
    rejection_reason: str | None = None
    rejection_notes: str | None = None
    item_id: UUID | None = None
    item_code: str | None = None
    class Config:
        from_attributes = True

class SampleRequestCreate(BaseModel):
    customer_id: Optional[UUID] = None
    request_date: Optional[str] = None
    project: Optional[str] = None
    customer_article_code: Optional[str] = None
    internal_article_code: Optional[str] = None
    width: Optional[str] = None
    variant_type: str = "color"
    colors: list[SampleColorCreate] = []
    main_material: Optional[str] = None
    middle_material: Optional[str] = None
    bottom_material: Optional[str] = None
    weft: Optional[str] = None
    warp: Optional[str] = None
    original_weight: Optional[float] = None
    original_weight_unit: Optional[str] = None
    production_weight: Optional[float] = None
    production_weight_unit: Optional[str] = None
    additional_info: Optional[str] = None
    quantity: Optional[str] = None
    sample_size: Optional[str] = None
    estimated_completion_date: Optional[str] = None
    completion_description: Optional[str] = None
    notes: Optional[str] = None

class SampleColorUpdate(BaseModel):
    id: Optional[UUID] = None
    name: str
    is_repeat: bool = False
    order: int = 0

class SampleRequestUpdate(BaseModel):
    customer_id: Optional[UUID] = None
    request_date: Optional[str] = None
    project: Optional[str] = None
    customer_article_code: Optional[str] = None
    internal_article_code: Optional[str] = None
    width: Optional[str] = None
    variant_type: str = "color"
    colors: list[SampleColorUpdate] = []
    main_material: Optional[str] = None
    middle_material: Optional[str] = None
    bottom_material: Optional[str] = None
    weft: Optional[str] = None
    warp: Optional[str] = None
    original_weight: Optional[float] = None
    original_weight_unit: Optional[str] = None
    production_weight: Optional[float] = None
    production_weight_unit: Optional[str] = None
    additional_info: Optional[str] = None
    quantity: Optional[str] = None
    sample_size: Optional[str] = None
    estimated_completion_date: Optional[str] = None
    completion_description: Optional[str] = None
    notes: Optional[str] = None

class SampleRequestResponse(BaseModel):
    id: UUID
    code: str
    version: int
    status: str
    variant_type: str = "color"
    created_at: datetime
    is_unread: bool = False
    customer_id: Optional[UUID] = None
    request_date: Optional[date] = None
    project: Optional[str] = None
    customer_article_code: Optional[str] = None
    internal_article_code: Optional[str] = None
    width: Optional[str] = None
    colors: list[SampleColorResponse] = []
    main_material: Optional[str] = None
    middle_material: Optional[str] = None
    bottom_material: Optional[str] = None
    weft: Optional[str] = None
    warp: Optional[str] = None
    original_weight: Optional[float] = None
    original_weight_unit: Optional[str] = None
    production_weight: Optional[float] = None
    production_weight_unit: Optional[str] = None
    additional_info: Optional[str] = None
    quantity: Optional[str] = None
    sample_size: Optional[str] = None
    estimated_completion_date: Optional[date] = None
    completion_description: Optional[str] = None
    notes: Optional[str] = None
    completion_image_url: Optional[str] = None
    design_pdf_url: Optional[str] = None
    created_by_name: Optional[str] = None
    created_by_role: Optional[str] = None
    class Config:
        from_attributes = True

# --- Lab Dip Request Schemas ---

# --- Color Library Schemas ---

class ColorCreate(BaseModel):
    code: str
    name: str
    pantone_ref: Optional[str] = None
    colour_index: Optional[str] = None
    hex: Optional[str] = None
    substrate: Optional[str] = None
    customer_id: Optional[UUID] = None
    customer_color_code: Optional[str] = None
    spectro_notes: Optional[str] = None
    notes: Optional[str] = None
    status: str = "active"
    source_lab_dip_line_id: Optional[UUID] = None

class ColorUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    pantone_ref: Optional[str] = None
    colour_index: Optional[str] = None
    hex: Optional[str] = None
    substrate: Optional[str] = None
    customer_id: Optional[UUID] = None
    customer_color_code: Optional[str] = None
    spectro_notes: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class ColorResponse(BaseModel):
    id: UUID
    code: str
    name: str
    pantone_ref: Optional[str] = None
    colour_index: Optional[str] = None
    hex: Optional[str] = None
    substrate: Optional[str] = None
    customer_id: Optional[UUID] = None
    customer_name: Optional[str] = None
    customer_color_code: Optional[str] = None
    spectro_notes: Optional[str] = None
    notes: Optional[str] = None
    status: str = "active"
    attribute_value_id: Optional[UUID] = None
    source_lab_dip_line_id: Optional[UUID] = None
    recipe_count: int = 0
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ColorListResponse(BaseModel):
    items: list[ColorResponse] = []
    total: int = 0
    page: int = 1
    size: int = 50


class ComboCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    status: str = "active"

class ComboUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class ComboResponse(BaseModel):
    id: UUID
    code: str
    name: str
    description: Optional[str] = None
    status: str = "active"
    attribute_value_id: Optional[UUID] = None
    usage_count: int = 0
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ComboListResponse(BaseModel):
    items: list[ComboResponse] = []
    total: int = 0
    page: int = 1
    size: int = 50


class LabDipLineCreate(BaseModel):
    color_name: str
    color_id: Optional[UUID] = None
    submission_round: int = 1
    recipe_ref: Optional[str] = None
    order: int = 0

class LabDipLineUpdate(BaseModel):
    id: Optional[UUID] = None
    color_name: str
    color_id: Optional[UUID] = None
    submission_round: int = 1
    recipe_ref: Optional[str] = None
    order: int = 0

class LabDipLineResponse(BaseModel):
    id: UUID
    color_name: str
    color_id: Optional[UUID] = None
    submission_round: int = 1
    recipe_ref: Optional[str] = None
    status: str = "PENDING"
    remarks: Optional[str] = None
    order: int = 0
    model_config = ConfigDict(from_attributes=True)

class LabDipRequestCreate(BaseModel):
    customer_id: Optional[UUID] = None
    base_item_id: Optional[UUID] = None
    approved_recipe_id: Optional[UUID] = None
    color_id: Optional[UUID] = None
    request_date: Optional[str] = None
    season: Optional[str] = None
    customer_article_code: Optional[str] = None
    internal_article_code: Optional[str] = None
    substrate: Optional[str] = None
    color_standard: Optional[str] = None
    request_type: str = "NEW"
    due_date: Optional[str] = None
    estimated_completion_date: Optional[str] = None
    notes: Optional[str] = None
    dips: list[LabDipLineCreate] = []

class LabDipRequestUpdate(BaseModel):
    customer_id: Optional[UUID] = None
    base_item_id: Optional[UUID] = None
    approved_recipe_id: Optional[UUID] = None
    color_id: Optional[UUID] = None
    request_date: Optional[str] = None
    season: Optional[str] = None
    customer_article_code: Optional[str] = None
    internal_article_code: Optional[str] = None
    substrate: Optional[str] = None
    color_standard: Optional[str] = None
    request_type: str = "NEW"
    due_date: Optional[str] = None
    estimated_completion_date: Optional[str] = None
    notes: Optional[str] = None
    dips: list[LabDipLineUpdate] = []

class LabDipRequestResponse(BaseModel):
    id: UUID
    code: str
    status: str
    request_type: str = "NEW"
    created_at: datetime
    customer_id: Optional[UUID] = None
    base_item_id: Optional[UUID] = None
    approved_recipe_id: Optional[UUID] = None
    color_id: Optional[UUID] = None
    request_date: Optional[date] = None
    season: Optional[str] = None
    customer_article_code: Optional[str] = None
    internal_article_code: Optional[str] = None
    substrate: Optional[str] = None
    color_standard: Optional[str] = None
    due_date: Optional[date] = None
    estimated_completion_date: Optional[date] = None
    notes: Optional[str] = None
    dips: list[LabDipLineResponse] = []
    model_config = ConfigDict(from_attributes=True)

# --- Auth Schemas ---

class PermissionBase(BaseModel):
    code: str
    description: str

class PermissionResponse(PermissionBase):
    id: UUID
    class Config:
        from_attributes = True

class RoleBase(BaseModel):
    name: str
    description: str | None = None
    allowed_work_center_types: list[str] | None = None

class RoleCreate(RoleBase):
    permission_ids: list[UUID] = []

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permission_ids: Optional[list[UUID]] = None
    allowed_work_center_types: Optional[list[str]] = None

class RoleResponse(RoleBase):
    id: UUID
    permissions: list[PermissionResponse] = []
    class Config:
        from_attributes = True

class UserBase(BaseModel):
    username: str
    full_name: str
    role_id: UUID | None = None

class UserCreate(UserBase):
    password: str
    permission_ids: list[UUID] = []
    allowed_categories: list[str] | None = None
    avatar_id: str | None = None

class UserUpdate(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    role_id: Optional[UUID] = None
    permission_ids: Optional[list[UUID]] = None
    allowed_categories: Optional[list[str]] = None
    password: Optional[str] = None
    avatar_id: Optional[str] = None

class UserResponse(UserBase):
    id: UUID
    role: RoleResponse | None = None
    permissions: list[PermissionResponse] = []
    allowed_categories: list[str] | None = None
    avatar_id: str | None = None
    is_active: bool = True
    last_login_at: datetime | None = None
    class Config:
        from_attributes = True

class BOMAutomatorProfileCreate(BaseModel):
    name: str
    levels: list[list[str]]

class BOMAutomatorProfileResponse(BaseModel):
    id: UUID
    name: str
    levels: list[list[str]]
    class Config:
        from_attributes = True

class UserPreferenceUpsert(BaseModel):
    value: Any

class UserPreferenceResponse(BaseModel):
    key: str
    value: Any
    class Config:
        from_attributes = True

class DatabaseResponse(BaseModel):
    message: str
    status: bool
    data: Optional[dict] = None

class ConnectionProfile(BaseModel):
    name: str
    url: str
    is_active: bool = False

class AuditLogResponse(BaseModel):
    id: UUID
    user_id: UUID | None
    action: str
    entity_type: str
    entity_id: str
    details: str | None
    changes: dict | None
    timestamp: datetime
    
    class Config:
        from_attributes = True

class PaginatedAuditLogResponse(BaseModel):
    items: list[AuditLogResponse]
    total: int
    page: int
    size: int

# ── Dyeing & Setting ──────────────────────────────────────────────────

class DyeRecipeLineCreate(BaseModel):
    item_id: UUID
    qty_per_100kg: float | None = None
    qty_per_liter: float | None = None
    uom_id: UUID | None = None
    chemical_type: str = "OTHER"
    sort_order: int = 0

class DyeRecipeLineResponse(DyeRecipeLineCreate):
    id: UUID
    recipe_id: UUID
    item_name: str | None = None
    uom_name: str | None = None
    model_config = ConfigDict(from_attributes=True)

class DyeRecipeWashBathCreate(BaseModel):
    bath_number: int
    description: str

class DyeRecipeWashBathResponse(DyeRecipeWashBathCreate):
    id: UUID
    recipe_id: UUID
    model_config = ConfigDict(from_attributes=True)

class DyeRecipeFinishingCreate(BaseModel):
    description: str
    sort_order: int = 0

class DyeRecipeFinishingResponse(DyeRecipeFinishingCreate):
    id: UUID
    recipe_id: UUID
    model_config = ConfigDict(from_attributes=True)

class DyeRecipeCreate(BaseModel):
    code: str
    name: str
    attribute_value_ids: list[UUID] = []
    color_standard: str | None = None
    color_id: UUID | None = None
    substrate_type: str | None = None
    notes: str | None = None
    is_active: bool = True
    lines: list[DyeRecipeLineCreate] = []
    wash_baths: list[DyeRecipeWashBathCreate] = []
    finishing_steps: list[DyeRecipeFinishingCreate] = []

class DyeRecipeUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    color_standard: str | None = None
    color_id: UUID | None = None
    substrate_type: str | None = None
    notes: str | None = None
    is_active: bool | None = None
    attribute_value_ids: list[UUID] | None = None
    lines: list[DyeRecipeLineCreate] | None = None
    wash_baths: list[DyeRecipeWashBathCreate] | None = None
    finishing_steps: list[DyeRecipeFinishingCreate] | None = None

class DyeRecipeResponse(BaseModel):
    id: UUID
    code: str
    name: str
    color_standard: str | None = None
    color_id: UUID | None = None
    color_name: str | None = None
    substrate_type: str | None = None
    notes: str | None = None
    is_active: bool
    created_at: datetime
    attribute_value_ids: list[UUID] = []
    lines: list[DyeRecipeLineResponse] = []
    wash_baths: list[DyeRecipeWashBathResponse] = []
    finishing_steps: list[DyeRecipeFinishingResponse] = []
    model_config = ConfigDict(from_attributes=True)

class DyeingRunChemicalCreate(BaseModel):
    item_id: UUID
    planned_qty: float
    actual_qty: float
    uom_id: UUID | None = None

class DyeingRunChemicalResponse(DyeingRunChemicalCreate):
    id: UUID
    run_id: UUID
    item_name: str | None = None
    uom_name: str | None = None
    model_config = ConfigDict(from_attributes=True)

class DyeingRunCreate(BaseModel):
    work_order_id: UUID
    recipe_id: UUID | None = None
    substrate_qty: float
    input_batch_id: UUID | None = None
    machine_name: str | None = None
    liquor_ratio: float | None = None
    volume_air_liters: float | None = None
    machine_speed: float | None = None
    machine_pressure: str | None = None
    temperature_c: float | None = None
    duration_min: int | None = None
    operator_name: str | None = None
    notes: str | None = None
    color_name: str | None = None
    color_matching_ref: str | None = None
    lot_number: str | None = None
    customer_name: str | None = None
    artikel: str | None = None
    po_number: str | None = None
    qty_order_kg: float | None = None

class DyeingRunCompletePayload(BaseModel):
    shade_result: str | None = None
    shade_notes: str | None = None
    output_batch_number: str
    chemicals: list[DyeingRunChemicalCreate]

class DyeingRunResponse(BaseModel):
    id: UUID
    work_order_id: UUID
    run_number: int
    recipe_id: UUID | None = None
    substrate_qty: float
    input_batch_id: UUID | None = None
    output_batch_id: UUID | None = None
    machine_name: str | None = None
    liquor_ratio: float | None = None
    volume_air_liters: float | None = None
    machine_speed: float | None = None
    machine_pressure: str | None = None
    color_name: str | None = None
    color_matching_ref: str | None = None
    lot_number: str | None = None
    customer_name: str | None = None
    artikel: str | None = None
    po_number: str | None = None
    qty_order_kg: float | None = None
    temperature_c: float | None = None
    duration_min: int | None = None
    status: str
    shade_result: str | None = None
    shade_notes: str | None = None
    operator_name: str | None = None
    notes: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    chemicals: list[DyeingRunChemicalResponse] = []
    recipe_name: str | None = None
    input_batch_number: str | None = None
    output_batch_number: str | None = None
    model_config = ConfigDict(from_attributes=True)

class SettingRunCreate(BaseModel):
    work_order_id: UUID
    substrate_qty: float
    input_batch_id: UUID | None = None
    machine_name: str | None = None
    temperature_c: float | None = None
    speed_mpm: float | None = None
    width_cm: float | None = None
    overfeed_pct: float | None = None
    operator_name: str | None = None
    notes: str | None = None

class SettingRunCompletePayload(BaseModel):
    output_batch_number: str
    actual_width_cm: float | None = None
    actual_gsm: float | None = None
    actual_shrinkage_pct: float | None = None

class SettingRunResponse(BaseModel):
    id: UUID
    work_order_id: UUID
    run_number: int
    substrate_qty: float
    input_batch_id: UUID | None = None
    output_batch_id: UUID | None = None
    machine_name: str | None = None
    temperature_c: float | None = None
    speed_mpm: float | None = None
    width_cm: float | None = None
    overfeed_pct: float | None = None
    actual_width_cm: float | None = None
    actual_gsm: float | None = None
    actual_shrinkage_pct: float | None = None
    status: str
    operator_name: str | None = None
    notes: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    input_batch_number: str | None = None
    output_batch_number: str | None = None
    model_config = ConfigDict(from_attributes=True)

# --- Settings Schemas ---
class CompanyProfileBase(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    tax_id: Optional[str] = None

class CompanyProfileUpdate(CompanyProfileBase):
    pass

class CompanyProfileResponse(CompanyProfileBase):
    id: UUID
    class Config:
        from_attributes = True

# --- Batch / Lot Schemas ---

class BatchCreate(BaseModel):
    item_id: UUID
    notes: Optional[str] = None

class LeftoverBeamCreate(BaseModel):
    """Re-lot leftover warp from a WEAVING WO's merged (batch-less) kg pool
    back into a trackable beam batch at the WO's input location."""
    item_id: UUID
    qty: float
    beam_number: Optional[str] = None   # blank → auto-generate BM-YYYYMMDD-NNNN
    ends: Optional[int] = None
    notes: Optional[str] = None

class BatchResponse(BaseModel):
    id: UUID
    batch_number: str
    vendor_lot: Optional[str] = None  # supplier's lot reference (non-unique)
    item_id: UUID
    item_code: Optional[str] = None   # populated by batches endpoints (eager-loaded item)
    item_name: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    ends: Optional[int] = None
    source_wo_id: Optional[UUID] = None
    quality_status: str = "GOOD"    # GOOD | REJECTED
    remaining: Optional[float] = None  # stock balance for this batch (populated by list endpoint)
    location_id: Optional[UUID] = None    # current location — beam is atomic, always at most one (populated by list endpoint)
    location_name: Optional[str] = None
    # Origin lineage — resolved from source_wo_id → WO → MO → PR/SO (populated by batches endpoints)
    wo_code: Optional[str] = None
    mo_id: Optional[UUID] = None
    mo_code: Optional[str] = None
    production_run_id: Optional[UUID] = None
    production_run_code: Optional[str] = None
    sales_order_id: Optional[UUID] = None
    sales_order_code: Optional[str] = None
    # GR origin — resolved from GoodsReceiptLine → GoodsReceipt → PurchaseOrder
    po_id: Optional[UUID] = None
    po_number: Optional[str] = None
    # Immediate upstream lots this batch was made from (one level back) — e.g. a
    # beam's raw-material/yarn goods-receipt lots. Populated on demand only
    # (with_source_lots=true) so it powers RM-lot visibility at staging.
    source_lots: Optional[list[str]] = None

    class Config:
        from_attributes = True

class PaginatedBatchResponse(BaseModel):
    items: list[BatchResponse]
    total: int
    page: int
    size: int

class BatchConsumptionResponse(BaseModel):
    id: UUID
    manufacturing_order_id: UUID
    mo_code: Optional[str] = None          # resolved from MO
    input_batch_id: UUID
    output_batch_id: Optional[UUID] = None
    output_batch_number: Optional[str] = None  # resolved from output Batch
    qty_consumed: float
    created_at: datetime

    class Config:
        from_attributes = True

class BatchTraceBackNode(BaseModel):
    """Backward genealogy: this batch + the input batches it was made from."""
    batch: BatchResponse
    qty_consumed: Optional[float] = None       # qty of THIS batch consumed into the parent node
    manufacturing_order_id: Optional[UUID] = None
    mo_code: Optional[str] = None
    sales_order_code: Optional[str] = None     # originating SO of the MO that consumed this batch
    inputs: list["BatchTraceBackNode"] = []

BatchTraceBackNode.model_rebuild()

class BatchTraceResponse(BaseModel):
    batch: BatchResponse
    consumptions: list[BatchConsumptionResponse]

class MOLineBatchAssignment(BaseModel):
    bom_line_item_id: UUID
    attribute_value_ids: list[UUID] = []
    batch_id: UUID
    qty: float

class MOCompleteWithBatchesPayload(BaseModel):
    output_batch_id: Optional[UUID] = None
    material_batches: list[MOLineBatchAssignment] = []

class POLineBatchAssignment(BaseModel):
    line_id: UUID
    batch_id: UUID

class POReceiveWithBatchesPayload(BaseModel):
    batch_assignments: list[POLineBatchAssignment] = []

# --- Packing / Dispatch (outbound Surat Jalan) Schemas ---

class PackingPackageItemPayload(BaseModel):
    # Reference the SO line (stable across line rebuilds); server resolves to packing_line.
    sales_order_line_id: UUID
    qty: float = 0

class PackingPackagePayload(BaseModel):
    package_no: int = 1
    label: str | None = None
    weight_kg: float | None = None
    notes: str | None = None
    contents: list[PackingPackageItemPayload] = []

class PackingLinePayload(BaseModel):
    sales_order_line_id: UUID
    item_id: UUID
    qty_packed: float = 0
    source_location_id: UUID | None = None
    batch_id: UUID | None = None

class PackingOrderCreate(BaseModel):
    sales_order_id: UUID
    source_location_id: UUID | None = None
    lines: list[PackingLinePayload] = []  # empty -> server seeds from SO remaining

class PackingOrderUpdate(BaseModel):
    source_location_id: UUID | None = None
    qc_passed: bool | None = None
    qc_inspector: str | None = None
    delivery_note_number: str | None = None
    delivery_date: datetime | None = None
    carrier: str | None = None
    vehicle_plate: str | None = None
    driver: str | None = None
    notes: str | None = None
    lines: list[PackingLinePayload] | None = None
    packages: list[PackingPackagePayload] | None = None

class PackingPackageItemResponse(BaseModel):
    id: UUID
    packing_line_id: UUID
    qty: float
    class Config:
        from_attributes = True

class PackingPackageResponse(BaseModel):
    id: UUID
    package_no: int
    label: str | None = None
    weight_kg: float | None = None
    notes: str | None = None
    contents: list[PackingPackageItemResponse] = []
    class Config:
        from_attributes = True

class PackingLineResponse(BaseModel):
    id: UUID
    sales_order_line_id: UUID
    item_id: UUID
    item_name: str | None = None
    item_code: str | None = None
    item_uom: str | None = None
    qty_packed: float
    source_location_id: UUID | None = None
    batch_id: UUID | None = None
    batch_number: str | None = None
    class Config:
        from_attributes = True

class PackingOrderResponse(BaseModel):
    id: UUID
    code: str
    sales_order_id: UUID
    sales_order_code: str | None = None
    customer_name: str | None = None
    source_location_id: UUID | None = None
    status: str
    qc_passed: bool
    qc_inspector: str | None = None
    qc_at: datetime | None = None
    delivery_note_number: str | None = None
    delivery_date: datetime | None = None
    carrier: str | None = None
    vehicle_plate: str | None = None
    driver: str | None = None
    notes: str | None = None
    dispatched_at: datetime | None = None
    created_at: datetime
    lines: list[PackingLineResponse] = []
    packages: list[PackingPackageResponse] = []
    class Config:
        from_attributes = True

class PackingOrderListResponse(BaseModel):
    items: list[PackingOrderResponse]
    total: int
    page: int
    size: int

# ── Work-Center Performance Monitoring (weaving runs + production calendar) ──

class WeavingRunCreate(BaseModel):
    work_center_id: UUID
    mo_id: UUID
    lines: int = 1
    rate_per_line_g_min: float = 5
    target_efficiency_pct: float = 50
    start_date: date
    notes: str | None = None

class WeavingRunUpdate(BaseModel):
    lines: int | None = None
    rate_per_line_g_min: float | None = None
    target_efficiency_pct: float | None = None
    actual_qty_override: float | None = None
    status: str | None = None
    end_date: date | None = None
    notes: str | None = None

class WeavingRunResponse(BaseModel):
    id: UUID
    work_center_id: UUID
    mo_id: UUID
    lines: int
    rate_per_line_g_min: float
    target_efficiency_pct: float
    start_date: date
    end_date: date | None = None
    status: str
    actual_qty_override: float | None = None
    notes: str | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class WorkCenterHolidayCreate(BaseModel):
    holiday_date: date
    note: str | None = None

class WorkCenterHolidayResponse(BaseModel):
    id: UUID
    work_center_id: UUID
    holiday_date: date
    note: str | None = None
    model_config = ConfigDict(from_attributes=True)

class WorkCenterCalendarUpdate(BaseModel):
    working_weekdays: list[int]  # 0=Mon .. 6=Sun
