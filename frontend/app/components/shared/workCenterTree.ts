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
