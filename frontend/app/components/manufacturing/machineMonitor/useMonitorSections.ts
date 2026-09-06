import { useMemo } from 'react';

/**
 * The section/rollup maths both machine monitors run over their grid.
 *
 * Machines are shown per work-center container so a whole bank can be read — and
 * have its calendar set — in one go. Each section carries its own health roll-up
 * (running / below-target / late / avg efficiency): that is what lets a bank
 * report itself from its header band, which is the whole reason neither monitor
 * hides groups behind tabs. A group scrolled past — or filtered out — still
 * surfaces its alarms in the chip bar.
 *
 * Generic over the run shape on purpose. A dye card has no `is_late`, so `late`
 * falls out at 0 without the caller configuring anything; a loom card has one and
 * it counts. Neither monitor needs its own copy of this.
 */
export type MonitorSection<M> = {
    id: string | null;
    code: string;
    name: string;
    machines: M[];
    running: number;
    late: number;
    belowTarget: number;
    avgEff: number | null;
};

type AnyRun = { on_target?: boolean | null; efficiency_pct?: number | null; is_late?: boolean };

type Args<M> = {
    machines: M[];
    /** Every run on one machine card. */
    runsOf: (m: M) => AnyRun[];
    /** Section id to narrow to, or null for the whole plant. */
    groupFilter: string | null;
};

export const UNGROUPED = '__ungrouped__';

export function useMonitorSections<M extends {
    group_id?: string | null; group_code?: string | null; group_name?: string | null;
}>({ machines, runsOf, groupFilter }: Args<M>) {
    const sections = useMemo(() => {
        const byGroup = new Map<string, MonitorSection<M>>();
        for (const m of machines) {
            const key = m.group_id || UNGROUPED;
            if (!byGroup.has(key)) {
                byGroup.set(key, {
                    id: m.group_id || null, code: m.group_code || '', name: m.group_name || '',
                    machines: [], running: 0, late: 0, belowTarget: 0, avgEff: null,
                });
            }
            byGroup.get(key)!.machines.push(m);
        }
        return [...byGroup.values()]
            .sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || (a.code || '').localeCompare(b.code || ''))
            .map(sec => {
                const runs = sec.machines.flatMap(runsOf);
                // on_target is null until a run has an efficiency to judge (no elapsed
                // time yet) — only count a run that actually reports below.
                const belowTarget = runs.filter(r => r.on_target === false).length;
                const effs = runs
                    .map(r => r.efficiency_pct)
                    .filter((e): e is number => e !== null && e !== undefined);
                return {
                    ...sec,
                    running: runs.length,
                    // Projected past the date the order promised. A separate alarm from
                    // below-target: a machine can hold its efficiency and still miss the
                    // date because the order needs more machines or more working days.
                    late: runs.filter(r => r.is_late).length,
                    belowTarget,
                    avgEff: effs.length ? effs.reduce((a, b) => a + Number(b), 0) / effs.length : null,
                };
            });
    }, [machines, runsOf]);

    // The chip bar filters which sections RENDER; it never changes what was
    // measured, so the counts on the chips stay plant-wide. A filter that matches
    // nothing (the group was deleted or re-parented since it was picked) falls back
    // to everything — a monitor must never render an empty screen because of stale
    // UI state.
    const visibleSections = useMemo(() => {
        if (!groupFilter) return sections;
        const hit = sections.filter(s => (s.id || UNGROUPED) === groupFilter);
        return hit.length ? hit : sections;
    }, [sections, groupFilter]);

    return {
        sections,
        visibleSections,
        isGrouped: sections.some(s => !!s.id),
        plantBelowTarget: sections.reduce((n, s) => n + s.belowTarget, 0),
        plantLate: sections.reduce((n, s) => n + s.late, 0),
    };
}
