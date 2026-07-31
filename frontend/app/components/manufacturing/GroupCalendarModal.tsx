'use client';

import { useState, useEffect, useCallback } from 'react';
import ModalWrapper from '../shared/ModalWrapper';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { xpFont } from '../shared/xpTheme';
import { lvBtn, lvPrimaryBtn, lvInput, lvLabel, lvTh, lvTd } from '../shared/listViewTheme';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // 0=Mon..6=Sun

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** TYPE or GROUP node the calendar is applied from. */
    group: { id: string; code?: string; name?: string } | null;
    authFetch: (url: string, opts?: any) => Promise<Response>;
    apiBase: string;
    /** Called after a successful apply so the caller can reload its data. */
    onApplied?: () => void;
}

/**
 * Batch production calendar for a whole group of machines.
 *
 * Cascade-copy: the group node stores what was set (so the form reopens with it)
 * and every machine underneath is written the same weekdays + holidays in one
 * request. Editing one loom at a time is still possible from its own monitor card;
 * re-applying here overwrites those per-machine tweaks, which is the point.
 */
export default function GroupCalendarModal({ isOpen, onClose, group, authFetch, apiBase, onApplied }: Props) {
    const { uiStyle } = useTheme();
    const { t } = useLanguage();
    const classic = uiStyle === 'classic';

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
    const [holidays, setHolidays] = useState<{ holiday_date: string; note: string | null }[]>([]);
    const [machines, setMachines] = useState<any[]>([]);
    const [newHoliday, setNewHoliday] = useState('');
    const [newHolidayNote, setNewHolidayNote] = useState('');
    const [importYear, setImportYear] = useState<string>(String(new Date().getFullYear()));
    const [applyHolidays, setApplyHolidays] = useState(true);

    const groupId = group?.id;

    const load = useCallback(async () => {
        if (!groupId) return;
        setLoading(true);
        setError('');
        try {
            const res = await authFetch(`${apiBase}/work-center-groups/${groupId}/calendar`);
            if (!res.ok) { setError('Could not load the group calendar'); return; }
            const d = await res.json();
            setWeekdays(d.working_weekdays || [0, 1, 2, 3, 4]);
            setHolidays((d.holidays || []).map((h: any) => ({ holiday_date: String(h.holiday_date).slice(0, 10), note: h.note })));
            setMachines(d.machines || []);
        } finally {
            setLoading(false);
        }
    }, [groupId, apiBase, authFetch]);

    useEffect(() => {
        if (isOpen && groupId) {
            setApplyHolidays(true);
            setNewHoliday('');
            setNewHolidayNote('');
            load();
        }
    }, [isOpen, groupId, load]);

    const toggleWeekday = (d: number) =>
        setWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));

    const addHoliday = () => {
        if (!newHoliday) return;
        if (holidays.some(h => h.holiday_date === newHoliday)) return;
        setHolidays(prev => [...prev, { holiday_date: newHoliday, note: newHolidayNote || null }]
            .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)));
        setNewHoliday('');
        setNewHolidayNote('');
    };

    const apply = async () => {
        if (!groupId) return;
        setSaving(true);
        setError('');
        try {
            const res = await authFetch(`${apiBase}/work-center-groups/${groupId}/calendar`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    working_weekdays: weekdays,
                    // null = leave each machine's own holidays alone (weekdays only).
                    holidays: applyHolidays ? holidays : null,
                }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => null);
                setError(d?.detail || 'Could not apply the calendar');
                return;
            }
            onApplied && onApplied();
            onClose();
        } finally {
            setSaving(false);
        }
    };

    const importNational = async () => {
        const year = parseInt(importYear, 10);
        if (!year) return;
        const res = await authFetch(`${apiBase}/weaving/id-holidays?year=${year}`);
        if (!res.ok) return;
        const d = await res.json();
        setHolidays(prev => {
            const have = new Set(prev.map(h => h.holiday_date));
            const merged = [...prev];
            for (const h of (d.holidays || [])) {
                if (have.has(h.date)) continue;
                merged.push({ holiday_date: h.date, note: h.name });
                have.add(h.date);
            }
            return merged.sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
        });
        setApplyHolidays(true);
    };

    const label = group ? `${group.code || ''}${group.name ? ' — ' + group.name : ''}` : '';

    return (
        <ModalWrapper
            isOpen={isOpen}
            modeless
            onClose={onClose}
            size="lg"
            variant="primary"
            title={<><i className="bi bi-calendar3 me-1" /> {t('work_calendar')} — {label}</>}
            footer={
                <>
                    <span style={{ marginRight: 'auto', fontSize: classic ? 11 : 12, color: '#666', fontFamily: classic ? xpFont : undefined }}>
                        {machines.length} machine{machines.length !== 1 ? 's' : ''} in this group
                    </span>
                    <button type="button" style={lvBtn(classic)} onClick={onClose}>{t('cancel')}</button>
                    <button type="button" style={lvPrimaryBtn(classic)} onClick={apply} disabled={saving || loading || machines.length === 0}>
                        <i className="bi bi-check2-all" style={{ marginRight: 4 }} />
                        {saving ? 'Applying…' : `Apply to ${machines.length}`}
                    </button>
                </>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: classic ? xpFont : undefined, fontSize: classic ? 11 : undefined }}>
                {error && (
                    <div style={{ background: '#ffe8e8', border: '1px solid #e0a0a0', color: '#a00', padding: '4px 8px' }}>{error}</div>
                )}

                <div>
                    <label style={lvLabel(classic)}>Working days</label>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {WEEKDAY_LABELS.map((wd, i) => {
                            const on = weekdays.includes(i);
                            return (
                                <button
                                    key={wd}
                                    type="button"
                                    onClick={() => toggleWeekday(i)}
                                    style={{
                                        ...(on ? lvPrimaryBtn(classic) : lvBtn(classic)),
                                        minWidth: 46,
                                    }}
                                >
                                    {wd}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <label style={lvLabel(classic)}>
                        <input
                            type="checkbox"
                            checked={applyHolidays}
                            onChange={e => setApplyHolidays(e.target.checked)}
                            style={{ marginRight: 5 }}
                        />
                        Also replace holidays on every machine
                    </label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 6 }}>
                        <div>
                            <label style={lvLabel(classic)}>Date</label>
                            <input type="date" style={{ ...lvInput(classic), width: 140 }} value={newHoliday} onChange={e => setNewHoliday(e.target.value)} />
                        </div>
                        <div style={{ flex: 1, minWidth: 140 }}>
                            <label style={lvLabel(classic)}>Note</label>
                            <input style={lvInput(classic)} value={newHolidayNote} onChange={e => setNewHolidayNote(e.target.value)} placeholder="Cuti bersama" />
                        </div>
                        <button type="button" style={lvBtn(classic)} onClick={addHoliday} disabled={!newHoliday}>
                            <i className="bi bi-plus-lg" style={{ marginRight: 4 }} />Add
                        </button>
                        <span style={{ width: 1, alignSelf: 'stretch', background: '#c8c4b8' }} />
                        <div>
                            <label style={lvLabel(classic)}>National holidays</label>
                            <input type="number" style={{ ...lvInput(classic), width: 90 }} value={importYear} onChange={e => setImportYear(e.target.value)} />
                        </div>
                        <button type="button" style={lvBtn(classic)} onClick={importNational}>
                            <i className="bi bi-download" style={{ marginRight: 4 }} />Import
                        </button>
                    </div>

                    <div style={{ maxHeight: 190, overflow: 'auto', border: classic ? '1px solid #808080' : '1px solid #dbe1ea', background: '#fff' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={{ ...lvTh(classic), width: 110 }}>Date</th>
                                    <th style={lvTh(classic)}>Note</th>
                                    <th style={{ ...lvTh(classic), width: 36, borderRight: 'none' }} />
                                </tr>
                            </thead>
                            <tbody>
                                {holidays.map(h => (
                                    <tr key={h.holiday_date}>
                                        <td style={lvTd(classic)}>{h.holiday_date}</td>
                                        <td style={lvTd(classic)}>{h.note || ''}</td>
                                        <td style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'right' }}>
                                            <button
                                                type="button"
                                                style={{ ...lvBtn(classic), padding: '0 5px' }}
                                                onClick={() => setHolidays(prev => prev.filter(x => x.holiday_date !== h.holiday_date))}
                                                title="Remove"
                                            >
                                                <i className="bi bi-x" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {holidays.length === 0 && (
                                    <tr><td colSpan={3} style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'center', padding: 12, color: '#888', fontStyle: 'italic' }}>
                                        {loading ? 'Loading…' : 'No holidays set'}
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div>
                    <label style={lvLabel(classic)}>Machines that will be updated</label>
                    <div style={{ fontSize: classic ? 11 : 12, color: '#555', lineHeight: 1.5 }}>
                        {machines.length === 0
                            ? <span style={{ fontStyle: 'italic', color: '#888' }}>No machines under this group yet</span>
                            : machines.map((m: any) => m.code).join(', ')}
                    </div>
                </div>
            </div>
        </ModalWrapper>
    );
}
