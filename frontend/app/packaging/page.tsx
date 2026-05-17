'use client';

export default function PackagingPage() {
    return (
        <div style={{ padding: '40px 32px', fontFamily: 'Tahoma, "Segoe UI", sans-serif' }}>
            <div style={{
                maxWidth: 480,
                background: '#fff',
                border: '1px solid #c0ccee',
                borderTop: '3px solid #316ac5',
                padding: '28px 32px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <i className="bi bi-box2" style={{ fontSize: 22, color: '#316ac5' }} />
                    <span style={{ fontSize: 16, fontWeight: 'bold', color: '#00309c' }}>Packaging</span>
                    <span style={{
                        fontSize: 9,
                        fontWeight: 'bold',
                        background: '#fff3cd',
                        border: '1px solid #c77800',
                        color: '#4a3000',
                        padding: '1px 6px',
                        marginLeft: 4,
                    }}>IN PROGRESS</span>
                </div>
                <p style={{ fontSize: 11, color: '#444', margin: 0, lineHeight: 1.6 }}>
                    This section will track the packaging process for orders that are ready for dispatch.
                    It bridges production completion (SO status: READY) and shipment confirmation (SO status: SENT).
                </p>
                <div style={{ marginTop: 20, padding: '10px 14px', background: '#f0f4ff', border: '1px solid #b0c0e8', fontSize: 10.5, color: '#555' }}>
                    <strong>Planned scope:</strong>
                    <ul style={{ margin: '6px 0 0 0', paddingLeft: 16, lineHeight: 1.8 }}>
                        <li>Packaging orders linked to Sales Orders</li>
                        <li>Packing slip generation</li>
                        <li>QC / inspection step</li>
                        <li>Dispatch confirmation triggers SO to SENT</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
