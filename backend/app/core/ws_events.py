"""Delivery-side ACL for live events: who may receive which broadcast.

`/api/ws/events` is one global fan-out — every `manager.broadcast(...)` reached
every open socket, so a picker's browser received (and toasted) manufacturing
order codes and statuses it has no permission to open. This module is the filter:
the socket is authenticated at connect (`api/auth.ws_connection_state`), its
effective permission codes are snapshotted onto the connection, and
`ws_manager._local_broadcast` drops any event that connection may not see.

Each entry is a UNION — hold ANY listed code and the event is delivered. That
mirrors the read-side GETs, which are gated with unions of the same granular
codes. Codes come from the seed list in `db/init_db.py`; the legacy blob
`sales.manage` appears wherever the matching page is still gated on it (Packing
Orders, Pick Lists, Dispatch).

The unions are wider than the page that owns the event, on purpose: a WO event
moves the MO board, a stock event moves the work queue. The rule for adding a
code is "this event changes something that role can already see", not "this role
owns the domain".

An empty tuple means "any authenticated user" — only for events whose payload
carries no business data.

Unknown event types are DENIED, never delivered. A new broadcast type is
invisible to every client until it is listed here, so the failure mode of
forgetting is a stale UI, not a leak. ADD THE TYPE HERE whenever you add a new
`manager.broadcast({"type": ...})`.
"""

ADMIN_CODE = "admin.access"

EVENT_PERMISSIONS: dict[str, tuple[str, ...]] = {
    # ── Manufacturing ────────────────────────────────────────────────────────
    # The MO board, the PR page, the WO list and the weaving monitor all refetch
    # off these (frontend LiveKind 'production'). reports.view is deliberately
    # ABSENT: a dashboard-only user's KPIs refresh from KPI_UPDATE below, so
    # they never need the MO code/status payload.
    "MANUFACTURING_ORDER_UPDATE": (
        "manufacturing_order.view",
        "production_run.view",
        "work_order.view",
        "weaving_monitor.view",
    ),
    "WORK_ORDER_UPDATE": (
        "work_order.view",
        "manufacturing_order.view",
        "weaving_monitor.view",
        "beam.view",
    ),
    "PRODUCTION_RUN_UPDATE": (
        "production_run.view",
        "manufacturing_order.view",
        "sales_order.view",
    ),
    # Lowercase by history, not by design (services/weaving_service.py).
    "weaving_run": (
        "weaving_monitor.view",
        "work_order.view",
        "beam.view",
    ),
    # ── Stock ────────────────────────────────────────────────────────────────
    # Widest union in the map: 19 broadcast sites across production, packing and
    # dispatch land here, and the MO/PR pages re-pull stock balances off it too.
    "STOCK_UPDATE": (
        "stock_on_hand.view",
        "stock_ledger.view",
        "booking_stock.view",
        "lot.view",
        "quarantine.view",
        "work_order.view",
        "manufacturing_order.view",
        "production_run.view",
    ),
    "QUARANTINE_UPDATE": (
        "quarantine.view",
        "lot.view",
        "stock_on_hand.view",
    ),
    # ── Sales / outbound ─────────────────────────────────────────────────────
    "SALES_ORDER_UPDATE": ("sales_order.view", "sales.manage"),
    "PACKING_UPDATE": ("sales.manage", "sales_order.view", "shipment.view", "pick_list.scan"),
    "PICK_LIST_UPDATE": ("sales.manage", "pick_list.scan", "shipment.view", "sales_order.view"),
    "SHIPMENT_UPDATE": ("shipment.view", "sales.manage"),
    # ── Masters ──────────────────────────────────────────────────────────────
    "BOM_UPDATE": (
        "bom.view",
        "manufacturing_order.view",
        "production_run.view",
        "sales_order.view",
    ),
    "COLOR_UPDATE": (
        "color_code.view",
        "lab_dip_request.view",
        "dye_recipe.view",
        "item.view",
    ),
    "COMBO_UPDATE": ("combo_library.view", "item.view", "bom.view"),
    # ── Platform ─────────────────────────────────────────────────────────────
    "KPI_UPDATE": ("reports.view",),
    # A print layout changed. Carries no business data and every print modal in
    # the app reads templates, so this one is open to any authenticated user.
    "PRINT_TEMPLATE_UPDATE": (),
}


def can_receive(event_type: str, perms: set[str]) -> bool:
    """True if a connection holding `perms` may be sent `event_type`.

    `admin.access` short-circuits everything, matching `auth.user_has_permission`.
    """
    if ADMIN_CODE in perms:
        return True
    required = EVENT_PERMISSIONS.get(event_type)
    if required is None:
        return False
    if not required:
        return True
    return any(code in perms for code in required)
