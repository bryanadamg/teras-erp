'use client';

import { useState, useEffect, useCallback } from 'react';
import ModalWrapper from '../shared/ModalWrapper';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import {
    xpFont, familyColor, FormSection, FieldLabel, XPActionButton, WeekdayToggle,
    SectionTitle as SecTitle, ModalFooterActions,
} from '../shared/xpTheme';
import { lvInput, lvTh, lvTd, lvRow } from '../shared/listViewTheme';

const RED = familyColor('red');

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
                    {/* Shared modal footer (Cancel + solid submit) — a hand-rolled pair
                        here rendered flat gray in Classic, since the global .btn-primary
                        override strips the bevel gradient. */}
                    <ModalFooterActions
                        classic={classic}
                        onCancel={onClose}
                        cancelLabel={t('cancel')}
                        onSubmit={apply}
                        submitLabel={`${t('apply_to')} ${machines.length}`}
                        submittingLabel={`${t('saving')}…`}
                        submitting={saving}
                        variant="primary"
                        disabled={loading || machines.length === 0}
                    />
                </>
            }
        >
            {/* Sectioned with the shared FormSection / FieldLabel / XPActionButton set —
                the same chrome as the per-machine monitor modal this opens alongside,
                so the two calendars don't read as two different products. */}
            <div style={{ fontFamily: classic ? xpFont : undefined, fontSize: classic ? 11 : undefined }}>
                {error && (
                    <div style={{ background: '#ffe8e8', border: `1px solid ${RED}55`, color: RED, padding: '4px 8px', marginBottom: 10 }}>{error}</div>
                )}

                <FormSection classic={classic} title={<SecTitle icon="bi-calendar-week">{t('working_days')}</SecTitle>}>
                    {/* Shared control — identical to the single-machine calendar tab. */}
                    <WeekdayToggle value={weekdays} onToggle={toggleWeekday} classic={classic} />
                </FormSection>

                <FormSection classic={classic} title={
                    <SecTitle icon="bi-calendar3" right={
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                            <input type="checkbox" checked={applyHolidays} onChange={e => setApplyHolidays(e.target.checked)} />
                            {t('replace_holidays_on_machines')}
                        </label>
                    }>{t('holidays')}</SecTitle>
                }>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 6 }}>
                        <div>
                            <FieldLabel classic={classic}>{t('date')}</FieldLabel>
                            <input type="date" style={{ ...lvInput(classic), width: 140 }} value={newHoliday} onChange={e => setNewHoliday(e.target.value)} />
                        </div>
                        <div style={{ flex: 1, minWidth: 140 }}>
                            <FieldLabel classic={classic}>{t('note')}</FieldLabel>
                            <input style={lvInput(classic)} value={newHolidayNote} onChange={e => setNewHolidayNote(e.target.value)} placeholder="Cuti bersama" />
                        </div>
                        <XPActionButton classic={classic} tone="neutral" icon="bi-plus-lg" label={t('add')} disabled={!newHoliday} onClick={addHoliday} />
                        <span style={{ width: 1, alignSelf: 'stretch', background: '#c8c4b8' }} />
                        <div>
                            <FieldLabel classic={classic}>{t('national_holiday')}</FieldLabel>
                            <input type="number" style={{ ...lvInput(classic), width: 90 }} value={importYear} onChange={e => setImportYear(e.target.value)} />
                        </div>
                        <XPActionButton classic={classic} tone="neutral" icon="bi-download" label={t('import')} onClick={importNational} />
                    </div>

                    <div style={{ maxHeight: 190, overflow: 'auto', border: classic ? '1px solid #808080' : '1px solid #dbe1ea', background: '#fff' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={classic ? { background: '#d4d0c8' } : undefined}>
                                    <th style={{ ...lvTh(classic), width: 110 }}>{t('date')}</th>
                                    <th style={lvTh(classic)}>{t('note')}</th>
                                    <th style={{ ...lvTh(classic), width: 36, borderRight: 'none' }} />
                                </tr>
                            </thead>
                            <tbody>
                                {holidays.map((h, idx) => (
                                    <tr key={h.holiday_date} style={lvRow(classic, idx)}>
                                        <td style={lvTd(classic)}>{h.holiday_date}</td>
                                        <td style={lvTd(classic)}>{h.note || ''}</td>
                                        <td style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'right' }}>
                                            <XPActionButton
                                                classic={classic}
                                                tone="danger"
                                                icon="bi-x"
                                                title={t('remove')}
                                                onClick={() => setHolidays(prev => prev.filter(x => x.holiday_date !== h.holiday_date))}
                                            />
                                        </td>
                                    </tr>
                                ))}
                                {holidays.length === 0 && (
                                    <tr><td colSpan={3} style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'center', padding: 12, color: '#888', fontStyle: 'italic' }}>
                                        {loading ? t('loading') : t('no_holidays')}
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </FormSection>

                <FormSection classic={classic} title={<SecTitle icon="bi-cpu">{t('machines_to_update')}</SecTitle>}>
                    <div style={{ fontSize: classic ? 11 : 12, color: '#555', lineHeight: 1.5 }}>
                        {machines.length === 0
                            ? <span style={{ fontStyle: 'italic', color: '#888' }}>{t('no_machines_in_group')}</span>
                            : machines.map((m: any) => m.code).join(', ')}
                    </div>
                </FormSection>
            </div>
        </ModalWrapper>
    );
}
