// Work-center tree helpers (TYPE -> GROUP -> MACHINE).
//
// The GROUP tier is optional, so depth cannot be read off parent_id: a group and a
// machine both have a parent. Every picker/tree must ask node_type instead —
// `wc.parent_id ? machine : group` was correct only while the tree had two levels.
// Rows written before the group tier existed have no node_type; for them the old
// rule is still the right answer, which is what the fallback below encodes.

export type WCNodeType = 'TYPE' | 'GROUP' | 'MACHINE';

export const wcNodeType = (wc: any): WCNodeType =>
    String(wc?.node_type || (wc?.parent_id ? 'MACHINE' : 'TYPE')).toUpperCase() as WCNodeType;

export const isMachineWC = (wc: any) => wcNodeType(wc) === 'MACHINE';
export const isGroupWC = (wc: any) => wcNodeType(wc) === 'GROUP';
export const isTypeWC = (wc: any) => wcNodeType(wc) === 'TYPE';
/** TYPE or GROUP — anything that holds other work centers. */
export const isContainerWC = (wc: any) => !isMachineWC(wc);

/** Direct children of a node, optionally restricted to one level. */
export const childrenOfWC = (workCenters: any[], parentId: string, level?: WCNodeType) =>
    (workCenters || []).filter((wc: any) =>
        String(wc.parent_id || '') === String(parentId) && (!level || wcNodeType(wc) === level));

/**
 * The center type a node runs under. Machines usually carry their own `center_type`,
 * but rows created through the tree UI can leave it blank and inherit it from the
 * GROUP/TYPE above — so walk up until one is found. Returns '' when nothing declares it.
 */
export function centerTypeOfWC(workCenters: any[], wc: any): string {
    const byId = new Map((workCenters || []).map((w: any) => [String(w.id), w]));
    let node: any = wc;
    const seen = new Set<string>();
    while (node && !seen.has(String(node.id))) {
        seen.add(String(node.id));
        const t = String(node.center_type || '').toUpperCase();
        if (t) return t;
        node = node.parent_id ? byId.get(String(node.parent_id)) : null;
    }
    return '';
}

/** Every MACHINE under a node, at any depth (a TYPE's machines may sit behind a GROUP). */
export function machinesUnderWC(workCenters: any[], rootId: string): any[] {
    const out: any[] = [];
    const seen = new Set<string>();
    const walk = (id: string) => {
        if (seen.has(id)) return;
        seen.add(id);
        for (const wc of (workCenters || [])) {
            if (String(wc.parent_id || '') !== String(id)) continue;
            if (isMachineWC(wc)) out.push(wc);
            else walk(String(wc.id));
        }
    };
    walk(String(rootId));
    return out;
}

/** Picker option shape shared by SearchableSelect machine pickers. */
export type WCOption = { value: string; label: string; subLabel?: string };

/** Name-sorted (natural order, so LOOM-10 follows LOOM-9) picker options. */
export const toMachineOptions = (list: any[]): WCOption[] =>
    (list || [])
        .slice()
        .sort((a: any, b: any) => String(a.name || '').localeCompare(
            String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }))
        .map((wc: any) => ({ value: String(wc.id), label: wc.name, subLabel: wc.code }));

/**
 * Machines that run under one centre type (e.g. 'PACKING'), falling back to every
 * machine when the plant has not declared that type yet — an unfilterable picker
 * beats an empty one, the same rule WOCompletionModal applies to its process scope.
 */
export function machinesOfCenterType(workCenters: any[], type: string): any[] {
    const machines = (workCenters || []).filter((wc: any) => isMachineWC(wc));
    const t = String(type || '').toUpperCase();
    if (!t) return machines;
    const matching = machines.filter((wc: any) => centerTypeOfWC(workCenters || [], wc) === t);
    return matching.length ? matching : machines;
}
