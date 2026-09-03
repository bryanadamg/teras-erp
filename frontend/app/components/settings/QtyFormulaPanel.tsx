'use client';

/**
 * Settings editor for the plant-wide production quantity formula.
 *
 * The Production Run modal's Apply button turns ordered sizes into sizes to
 * make. That rule was hardcoded (S=0, M=(S+M)/2, L=(S+M)/2+L, the rest as
 * ordered); this panel is where the client writes their own. One expression
 * per size plus a fallback, stored in `qty_formula_rules`.
 *
 * Expressions are validated as you type by the same parser the modal evaluates
 * with (`components/shared/qtyFormula.ts`) and again server-side on save, so a
 * formula that reaches the database always runs.
 *
 * The tester is not decoration: a formula is written against quantities, and
 * seeing what it does to a set of ordered sizes is the only way to know it says
 * what the planner meant before every future run uses it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { useToast } from '../shared/Toast';
import { xpBtn, xpInput, BTN_TONES, XP_BTN, FieldLabel } from '../shared/xpTheme';
import {
    DEFAULT_QTY_FORMULA,
    QTY_FORMULA_FALLBACK,
    QTY_FORMULA_SELF,
    QtyFormulaRule,
    evaluateExpression,
    validateExpression,
} from '../shared/qtyFormula';
import SettingsPanel from './SettingsPanel';
import { settingsActions, settingsHint, tdBase, xpTableHeader, xpThCell } from './settingsStyles';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api')
    .replace(/\/api$/, '') + '/api';

const SAMPLE = [10, 20, 30, 40, 0, 0, 0];

export default function QtyFormulaPanel() {
    const { authFetch } = useData();
    const { uiStyle } = useTheme();
    const { hasPermission } = useUser();
    const { showToast } = useToast();
    const classic = uiStyle === 'classic';
    const canEdit = hasPermission('admin.access');

    const [sizes, setSizes] = useState<string[]>([]);
    const [functions, setFunctions] = useState<string[]>([]);
    const [exprs, setExprs] = useState<Record<string, string>>({});
    const [defaults, setDefaults] = useState<QtyFormulaRule[]>(DEFAULT_QTY_FORMULA);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Tester inputs: the ordered qty per size, and the tolerance a planner
    // would type in the Production Run modal.
    const [sample, setSample] = useState<Record<string, string>>({});
    const [tolerance, setTolerance] = useState('0');

    const load = useCallback(async () => {
        try {
            const res = await authFetch(`${API_BASE}/settings/qty-formula`);
            if (!res.ok) throw new Error('load failed');
            const d = await res.json();
            const names: string[] = d.sizes || [];
            setSizes(names);
            setFunctions(d.functions || []);
            setDefaults(d.defaults?.length ? d.defaults : DEFAULT_QTY_FORMULA);
            const next: Record<string, string> = {};
            for (const r of (d.rules || [])) next[r.size_name] = r.expression;
            setExprs(next);
            setSample(prev => (Object.keys(prev).length ? prev : Object.fromEntries(
                names.map((n, i) => [n, String(SAMPLE[i] ?? 0)])
            )));
        } catch {
            showToast('Could not load the quantity formula', 'error');
        } finally {
            setLoading(false);
        }
    }, [authFetch, showToast]);

    useEffect(() => { load(); }, [load]);

    const rows = useMemo(() => [...sizes, QTY_FORMULA_FALLBACK], [sizes]);

    const errors = useMemo(() => {
        const out: Record<string, string> = {};
        for (const name of rows) {
            const expr = (exprs[name] || '').trim();
            if (!expr) continue;
            const err = validateExpression(expr, sizes);
            if (err) out[name] = err;
        }
        return out;
    }, [rows, exprs, sizes]);

    const hasErrors = Object.keys(errors).length > 0;

    // What the current draft would produce for the sample order. Mirrors the
    // modal: evaluate, scale by the tolerance, round up, blank out zeroes.
    const preview = useMemo(() => {
        const factor = 1 + (parseFloat(tolerance) || 0) / 100;
        const ordered: Record<string, number> = {};
        for (const n of sizes) ordered[n.toUpperCase()] = parseFloat(sample[n] || '0') || 0;
        const fallback = (exprs[QTY_FORMULA_FALLBACK] || '').trim() || QTY_FORMULA_SELF;

        const out: Record<string, string> = {};
        for (const n of sizes) {
            const expr = (exprs[n] || '').trim() || fallback;
            try {
                const value = evaluateExpression(expr, {
                    ...ordered,
                    [QTY_FORMULA_SELF]: ordered[n.toUpperCase()] ?? 0,
                }) * factor;
                out[n] = value > 0 ? String(Math.ceil(value)) : '—';
            } catch {
                out[n] = '!';
            }
        }
        return out;
    }, [sizes, sample, exprs, tolerance]);

    const handleSave = async () => {
        if (hasErrors) { showToast('Fix the highlighted expressions first', 'error'); return; }
        setSaving(true);
        try {
            const rules = rows
                .map(name => ({ size_name: name, expression: (exprs[name] || '').trim() }))
                .filter(r => r.expression);
            const res = await authFetch(`${API_BASE}/settings/qty-formula`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rules }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => null);
                throw new Error(d?.detail || 'Save failed');
            }
            const d = await res.json();
            const next: Record<string, string> = {};
            for (const r of (d.rules || [])) next[r.size_name] = r.expression;
            setExprs(next);
            showToast('Quantity formula saved', 'success');
        } catch (e: any) {
            showToast(e?.message || 'Save failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        const next: Record<string, string> = {};
        for (const r of defaults) next[r.size_name] = r.expression;
        setExprs(next);
    };

    const input = (value: string, onChange: (v: string) => void, extra: React.CSSProperties = {}, invalid = false) => (
        <input
            value={value}
            disabled={!canEdit}
            onChange={e => onChange(e.target.value)}
            style={classic
                ? xpInput({ width: '100%', ...extra, ...(invalid ? { borderColor: '#c00', background: '#fff5f5' } : {}) })
                : { width: '100%', ...extra }}
            className={classic ? '' : `form-control form-control-sm${invalid ? ' is-invalid' : ''}`}
        />
    );

    return (
        <SettingsPanel
            classic={classic}
            icon="bi-calculator"
            title="Production Quantity Formula"
            right={canEdit ? (
                <button
                    type="button"
                    onClick={handleReset}
                    style={classic ? xpBtn({ padding: '2px 8px' }) : undefined}
                    className={classic ? XP_BTN : 'btn btn-sm btn-outline-secondary'}
                >
                    <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 4 }}></i>
                    Reset to default
                </button>
            ) : undefined}
        >
            <div style={settingsHint(classic)}>
                Applied by the Apply button in a Production Run, turning the sizes a customer
                ordered into the sizes to make. Each result is then multiplied by the tolerance %
                the planner types and rounded up. A size name means the quantity ordered for that
                size; <code>{QTY_FORMULA_SELF}</code> means the quantity ordered for the row&apos;s own
                size, which is what the <code>{QTY_FORMULA_FALLBACK}</code> row uses. Leave a row
                blank to fall back to that row. Allowed: size names,{' '}
                <code>{QTY_FORMULA_SELF}</code>, numbers, <code>+ - * / ( )</code> and{' '}
                {functions.map(f => <code key={f} style={{ marginRight: 4 }}>{f}()</code>)}.
            </div>

            {loading ? (
                <div style={{ ...settingsHint(classic), marginTop: 10 }}>Loading…</div>
            ) : (
                <>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
                        <thead style={classic ? xpTableHeader : undefined}>
                            <tr>
                                <th style={classic ? { ...xpThCell, width: 70 } : { width: 70 }}>Size</th>
                                <th style={classic ? xpThCell : undefined}>Expression</th>
                                <th style={classic ? { ...xpThCell, width: 90 } : { width: 90 }}>Ordered</th>
                                <th style={classic ? { ...xpThCell, width: 80 } : { width: 80 }}>Makes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(name => {
                                const isFallback = name === QTY_FORMULA_FALLBACK;
                                return (
                                    <tr key={name}>
                                        <td style={classic ? { ...tdBase, fontWeight: 'bold' } : undefined}>
                                            {isFallback ? 'other' : name}
                                        </td>
                                        <td style={classic ? tdBase : undefined}>
                                            {input(
                                                exprs[name] || '',
                                                v => setExprs(prev => ({ ...prev, [name]: v })),
                                                { fontFamily: 'monospace' },
                                                !!errors[name],
                                            )}
                                            {errors[name] && (
                                                <div style={{ fontSize: 10, color: '#c00', marginTop: 2 }}>{errors[name]}</div>
                                            )}
                                            {isFallback && !errors[name] && (
                                                <div style={settingsHint(classic)}>
                                                    Used by any size with no row of its own, and by recipes with no
                                                    size breakdown at all.
                                                </div>
                                            )}
                                        </td>
                                        <td style={classic ? tdBase : undefined}>
                                            {isFallback ? null : input(
                                                sample[name] ?? '',
                                                v => setSample(prev => ({ ...prev, [name]: v })),
                                                { textAlign: 'right' },
                                            )}
                                        </td>
                                        <td style={classic
                                            ? { ...tdBase, textAlign: 'right', fontWeight: 'bold' }
                                            : { textAlign: 'right', fontWeight: 600 }}>
                                            {isFallback ? null : preview[name]}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 10 }}>
                        <div style={{ width: 120 }}>
                            <FieldLabel classic={classic}>Test tolerance %</FieldLabel>
                            {input(tolerance, setTolerance, { textAlign: 'right' })}
                        </div>
                        <div style={{ ...settingsHint(classic), flex: 1 }}>
                            The Ordered and Makes columns are a scratch pad — nothing here is saved
                            with the formula.
                        </div>
                    </div>

                    {canEdit && (
                        <div style={settingsActions(classic)}>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving || hasErrors}
                                style={classic ? xpBtn({ ...BTN_TONES.primary, padding: '3px 14px' }) : undefined}
                                className={classic ? XP_BTN : 'btn btn-sm btn-primary px-3'}
                            >
                                <i className="bi bi-save" style={{ marginRight: 4 }}></i>
                                {saving ? 'Saving…' : 'Save Formula'}
                            </button>
                        </div>
                    )}
                    {!canEdit && (
                        <div style={{ ...settingsHint(classic), marginTop: 10 }}>
                            Only admins can change the production quantity formula.
                        </div>
                    )}
                </>
            )}
        </SettingsPanel>
    );
}
