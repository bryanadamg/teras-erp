'use client';

import React, { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { useToast } from '../shared/Toast';
import ModalWrapper from '../shared/ModalWrapper';
import { xpFont, xpInput as xpInputBase, xpBtn as xpBtnBase, BTN_TONES } from '../shared/xpTheme';

const xpInput: React.CSSProperties = xpInputBase({ padding: '0 4px', width: '100%', boxSizing: 'border-box' });
const xpLabel: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, display: 'block', marginBottom: 2,
};
const xpBtn = (primary?: boolean): React.CSSProperties => xpBtnBase(primary ? { ...BTN_TONES.success, padding: '2px 14px' } : {});

interface Props {
    wo: any;               // weaving WO: id, code/name, input_location_id
    onClose: () => void;
}

// Register leftover warp after weaving: moves kg out of the input location's
// merged (batch-less) pool into a new trackable beam lot.
export default function LeftoverBeamModal({ wo, onClose }: Props) {
    const { authFetch } = useData() as any;
    const { showToast } = useToast();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [materials, setMaterials] = useState<any[]>([]);
    const [itemId, setItemId] = useState('');
    const [qty, setQty] = useState('');
    const [ends, setEnds] = useState('');
    const [beamNumber, setBeamNumber] = useState('');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // The WO's step materials — for a weaving WO these are its beam item(s)
    useEffect(() => {
        authFetch(`${API_BASE}/work-orders/${wo.id}/required-materials`)
            .then((r: Response) => (r.ok ? r.json() : []))
            .catch(() => [])
            .then((rows: any[]) => {
                setMaterials(rows || []);
                if ((rows || []).length === 1) setItemId(rows[0].item_id);
            });
    }, [wo.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const q = parseFloat(qty);
        if (!itemId) { showToast('Select the beam item', 'danger'); return; }
        if (!q || q <= 0) { showToast('Enter a positive quantity', 'danger'); return; }
        setSubmitting(true);
        try {
            const res = await authFetch(`${API_BASE}/work-orders/${wo.id}/leftover-beam`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: itemId,
                    qty: q,
                    ends: ends ? parseInt(ends, 10) : null,
                    beam_number: beamNumber.trim() || null,
                    notes: notes.trim() || null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to create leftover beam');
            }
            const batch = await res.json();
            showToast(`Leftover beam ${batch.batch_number} created (${q})`, 'success');
            onClose();
        } catch (err: any) {
            showToast(err.message, 'danger');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ModalWrapper
            isOpen
            onClose={onClose}
            title={`Leftover Beam — ${wo.code || wo.name}`}
            modeless
            size="sm"
            footer={
                <>
                    <button type="button" onClick={onClose} style={xpBtn()}>Cancel</button>
                    <button type="submit" form="leftover-beam-form" disabled={submitting} style={{ ...xpBtn(true), opacity: submitting ? 0.6 : 1 }}>
                        {submitting ? 'Saving...' : 'Create Beam Lot'}
                    </button>
                </>
            }
        >
            <form id="leftover-beam-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: xpFont }}>
                <div style={{ fontSize: 10, color: '#555', background: '#f5f4ee', border: '1px solid #aca899', padding: '4px 8px' }}>
                    Registers unwoven warp left on the loom as a new beam lot.
                    Quantity is taken from the merged kg pool at this WO's input location.
                </div>

                <div>
                    <label style={{ ...xpLabel, fontWeight: 'bold' }}>Beam Item</label>
                    <select style={{ ...xpInput, height: 22 }} value={itemId} onChange={e => setItemId(e.target.value)}>
                        <option value="">— select item —</option>
                        {materials.map((m: any) => (
                            <option key={m.item_id} value={m.item_id}>
                                {m.item_code || m.item_id}{m.item_name && m.item_name !== m.item_code ? ` — ${m.item_name}` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ ...xpLabel, fontWeight: 'bold' }}>Leftover Qty (kg)</label>
                        <input type="number" style={xpInput} value={qty} onChange={e => setQty(e.target.value)} min="0.0001" step="any" autoFocus required />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={xpLabel}>Ends (utas)</label>
                        <input type="number" style={xpInput} value={ends} onChange={e => setEnds(e.target.value)} min="1" step="1" placeholder="Optional" />
                    </div>
                </div>

                <div>
                    <label style={xpLabel}>Beam No.</label>
                    <input type="text" style={xpInput} value={beamNumber} onChange={e => setBeamNumber(e.target.value)} placeholder="Leave empty to auto-generate (BM-YYYYMMDD-NNNN)" />
                </div>

                <div>
                    <label style={xpLabel}>Notes</label>
                    <input type="text" style={xpInput} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
                </div>
            </form>
        </ModalWrapper>
    );
}
