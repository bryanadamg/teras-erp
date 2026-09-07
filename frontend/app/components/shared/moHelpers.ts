// A manufacturing order object may arrive without its `.bom` populated — root MOs
// from a fresh `/manufacturing-orders/{id}` fetch always carry it, but a shared/
// consolidated component MO pulled from local tree state (or the PR list's slimmed
// ManufacturingOrderListItem schema) can have it omitted. WOCompletionModal reads
// `mo.bom.lines` to build its material rows (and, from there, the per-material Lot
// dropdown) — pass an MO through here before opening that modal so the fallback is
// applied consistently everywhere, not just wherever a developer remembered to add it.
export function resolveMoBom(mo: any, boms: any[]): any {
    if (mo?.bom) return mo;
    const bom = (boms || []).find((b: any) => b.id === mo?.bom_id);
    return bom ? { ...mo, bom } : mo;
}

/**
 * How much of a BOM line an order of `baseQty` needs.
 *
 * `percentage` is the scaling field (every line has a non-zero one and a node's
 * lines sum to 100); `qty` is only read for legacy lines that predate it. The BOM's
 * `tolerance_percentage` is the INPUT-side wastage allowance — it inflates the
 * requirement. Do not confuse it with `overdelivery_tolerance_percentage`, which is
 * output-side and must never touch this number.
 *
 * Lives here rather than inside useManufacturingHelpers because it closes over
 * nothing: QRScannerView carried a byte-identical private copy, so the floor
 * scanner's material check could drift from the MO page's silently.
 */
export function calculateRequiredQty(baseQty: number, line: any, bom: any): number {
    let required: number;
    if (line.percentage > 0) {
        required = (baseQty * line.percentage) / 100;
    } else {
        required = baseQty * parseFloat(line.qty || 0);
    }
    const tolerance = parseFloat(bom?.tolerance_percentage || 0);
    if (tolerance > 0) required = required * (1 + tolerance / 100);
    return required;
}

/**
 * Stock of one item+variant at ONE location.
 *
 * Deliberately single-location: this answers "is it in the bin the line issues
 * from", which is what a WO-level material check asks. For "does the plant have it
 * anywhere" use `getStockAcrossLocations` from useManufacturingHelpers — netting is
 * location-agnostic, so that is the right question almost everywhere else.
 *
 * `stockBalance` is passed in rather than closed over so the floor scanner and the
 * MO page can share it; both previously kept their own copy of this comparison, one
 * matching variant keys by sorted join and one by length+every.
 */
export function stockAtLocation(
    stockBalance: any[], item_id: string, location_id: string,
    attribute_value_ids: string[] = [], required_qty = 0,
): { available: number; isEnough: boolean } {
    const targetKey = [...attribute_value_ids].map(String).sort().join(',');
    const matching = (stockBalance || []).filter((s: any) => {
        if (String(s.item_id) !== String(item_id)) return false;
        if (String(s.location_id) !== String(location_id)) return false;
        if (attribute_value_ids.length > 0) {
            return [...(s.attribute_value_ids || [])].map(String).sort().join(',') === targetKey;
        }
        return true;
    });
    const available = matching.reduce((sum: number, e: any) => sum + parseFloat(e.qty), 0);
    return { available, isEnough: available >= required_qty };
}
