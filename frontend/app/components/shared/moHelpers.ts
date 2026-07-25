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
