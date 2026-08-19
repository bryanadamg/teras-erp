'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useTimezone } from '../../context/TimezoneContext';
import { xpFont, StatusChip, CodeChip, CODE_FONT } from '../shared/xpTheme';
import { NAV_SECTIONS, navLabel, NavSection } from '../shared/navConfig';
import { lvThead } from '../shared/listViewTheme';

// ─────────────────────────────────────────────────────────────────────────────
// Section Home — a focused mini-dashboard per sidebar section. Reuses the data
// already loaded into DataContext (no backend calls). One framework component +
// a per-section builder; content is intentionally minimal for v1.
// Section identity (label/icon/accent) and quick links come from navConfig.
// ─────────────────────────────────────────────────────────────────────────────

type Tone = 'ok' | 'warn' | 'crit' | undefined;

interface Kpi { label: string; value: number | string; tone?: Tone; tab?: string }
interface ListRow { code: string; primary: string; status?: string; right?: string }
interface SectionList { title: string; cols: string[]; rows: ListRow[] }
interface SectionData { kpis: Kpi[]; list: SectionList | null }

const SECTION_META: Record<string, NavSection> = Object.fromEntries(
  NAV_SECTIONS.map((s) => [s.key, s])
);

const ACCENT_GRAD: Record<string, string> = {
  blue:  'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)',
  green: 'linear-gradient(to right, #1a7a1a 0%, #2ea42e 100%)',
  amber: 'linear-gradient(to right, #c07000 0%, #e09830 100%)',
  grey:  'linear-gradient(to bottom, #6a6a6a, #4a4a4a)',
};

// ── Per-section content builder (client-side filter of loaded data) ───────────
function buildSection(key: string, d: any, tzDate: (v: string | Date) => string): SectionData {
  const items: any[]        = d.items || [];
  const locations: any[]    = d.locations || [];
  const stockBalance: any[] = d.stockBalance || [];
  const stockEntries: any[] = d.stockEntries || [];
  const salesOrders: any[]  = d.salesOrders || [];
  const purchaseOrders: any[] = d.purchaseOrders || [];
  const samples: any[]      = d.samples || [];
  const partners: any[]     = d.partners || [];
  const mos: any[]          = d.manufacturingOrders?.length > 0 ? d.manufacturingOrders : (d.dashboardWorkOrders || []);
  const prs: any[]          = d.productionRuns || [];
  const auditLogs: any[]    = d.auditLogs || [];
  const kpis: any           = d.dashboardKPIs || {};
  const summary: any        = d.dashboardSummary || null;
  const itemIndex: any      = d.itemIndex || {};

  const nameOf = (id: string) =>
    itemIndex?.[String(id)]?.name || items.find((i: any) => i.id === id)?.name || id;
  const partnerName = (id: any) => partners.find((p: any) => String(p.id) === String(id))?.name || '';
  const byDateDesc = (a: any, b: any) =>
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  const today = new Date();

  switch (key) {
    case 'sales': {
      // salesOrders is now one server page (see DataContext, `/sales-orders` is
      // paginated), not the whole table, so this can undercount once the user
      // has paged/filtered the Sales Orders list elsewhere in the session.
      // dashboardSummary.open_so_count is PENDING-only (not PENDING+PARTIAL), a
      // different definition of "open" than this tile has always shown, so it
      // isn't a drop-in replacement — left as a known approximation for now.
      const open  = salesOrders.filter((s) => s.status === 'PENDING' || s.status === 'PARTIAL').length;
      const ready = salesOrders.filter((s) => s.status === 'READY').length;
      const customers = partners.filter((p) => p.type === 'CUSTOMER' && p.active).length;
      // samples is one server page now, never the whole table — the KPI is the
      // only correct source, so fall back to 0 rather than a page count.
      const activeSamples = kpis.active_samples ?? 0;
      const rows: ListRow[] = [...salesOrders].sort(byDateDesc).slice(0, 6).map((s) => ({
        code: s.code || s.id, primary: partnerName(s.partner_id ?? s.customer_id) || '—',
        status: s.status, right: s.created_at ? tzDate(s.created_at) : '',
      }));
      return {
        kpis: [
          { label: 'Open Orders',   value: open, tone: open > 0 ? 'warn' : 'ok', tab: 'sales-orders' },
          { label: 'Ready to Ship', value: ready, tone: ready > 0 ? 'ok' : undefined, tab: 'pick-lists' },
          { label: 'Customers',     value: customers, tab: 'customers' },
          { label: 'Active Samples', value: activeSamples, tab: 'samples' },
        ],
        list: { title: 'Recent Sales Orders', cols: ['Code', 'Customer', 'Status', 'Date'], rows },
      };
    }

    case 'procurement': {
      // Same caveat as 'sales' above: purchaseOrders is now one server page (see
      // DataContext, `/purchase-orders` is paginated), not the whole table, so
      // these tiles and the recent-PO list can undercount once the user has
      // paged/filtered the Purchase Orders list elsewhere in the session.
      // DataContext's poStatusCounts IS whole-table, but this view makes no
      // backend calls of its own and the /sections/* route doesn't fetch the PO
      // list, so it would read {} → 0 here — worse than an approximation. Left as
      // a known approximation until this view gets a summary endpoint.
      const openPO   = purchaseOrders.filter((p) => p.status === 'DRAFT' || p.status === 'RECEIVING').length;
      const receiving = purchaseOrders.filter((p) => p.status === 'RECEIVING').length;
      const suppliers = partners.filter((p) => p.type === 'SUPPLIER' && p.active).length;
      const rows: ListRow[] = [...purchaseOrders].sort(byDateDesc).slice(0, 6).map((p) => ({
        code: p.code || p.id, primary: partnerName(p.partner_id ?? p.supplier_id) || '—',
        status: p.status, right: p.created_at ? tzDate(p.created_at) : '',
      }));
      return {
        kpis: [
          { label: 'Open POs',   value: openPO, tone: openPO > 0 ? 'warn' : 'ok', tab: 'purchase-orders' },
          { label: 'Receiving',  value: receiving, tab: 'purchase-orders' },
          { label: 'Suppliers',  value: suppliers, tab: 'suppliers' },
        ],
        list: { title: 'Recent Purchase Orders', cols: ['Code', 'Supplier', 'Status', 'Date'], rows },
      };
    }

    case 'inventory': {
      const totalSkus = kpis.total_items ?? items.length;
      const lowStock  = kpis.low_stock ?? (summary?.low_stock_items?.length ?? 0);
      const totalQty  = stockBalance.reduce((s: number, b: any) => s + parseFloat(b.qty || 0), 0);
      const locCount  = locations.length;
      const rows: ListRow[] = (summary?.recent_movements?.length
        ? summary.recent_movements.map((m: any) => ({
            code: '', primary: m.item_name, status: undefined,
            right: `${m.qty_change > 0 ? '+' : ''}${m.qty_change}`,
          }))
        : [...stockEntries].sort(byDateDesc).slice(0, 6).map((e: any) => ({
            code: '', primary: nameOf(e.item_id), status: undefined,
            right: `${e.qty_change > 0 ? '+' : ''}${e.qty_change}`,
          }))
      ).slice(0, 6);
      return {
        kpis: [
          { label: 'Total SKUs', value: totalSkus, tab: 'inventory' },
          { label: 'Low Stock',  value: lowStock, tone: lowStock > 0 ? 'crit' : 'ok', tab: 'inventory' },
          { label: 'Total Qty',  value: Math.round(totalQty).toLocaleString(), tab: 'stock-on-hand' },
          { label: 'Locations',  value: locCount, tab: 'locations' },
        ],
        list: { title: 'Recent Movements', cols: ['Item', 'Qty'], rows },
      };
    }

    case 'engineering': {
      const active  = mos.filter((m) => m.status === 'IN_PROGRESS').length;
      const pending = mos.filter((m) => m.status === 'PENDING').length;
      const overdue = mos.filter((m) =>
        ['IN_PROGRESS', 'PENDING'].includes(m.status) &&
        m.target_end_date && new Date(m.target_end_date) < today).length;
      const rows: ListRow[] = mos
        .filter((m) => ['IN_PROGRESS', 'PENDING'].includes(m.status))
        .slice(0, 6).map((m) => ({
          code: m.code || m.id, primary: nameOf(m.item_id), status: m.status,
          right: m.target_end_date ? m.target_end_date.slice(0, 10) : '',
        }));
      return {
        kpis: [
          { label: 'Active',          value: active, tone: 'ok', tab: 'manufacturing-orders' },
          { label: 'Pending',         value: pending, tab: 'work-orders' },
          { label: 'Overdue',         value: overdue, tone: overdue > 0 ? 'crit' : 'ok', tab: 'work-orders' },
          { label: 'Production Runs', value: prs.length, tab: 'production-runs' },
        ],
        list: { title: 'Active Manufacturing Orders', cols: ['Code', 'Product', 'Status', 'Target'], rows },
      };
    }

    case 'dyeing': {
      // Data-thin section: no dyeing-run / lab-dip / color state in DataContext.
      // v1 surfaces navigation only; richer metrics need backend endpoints.
      return { kpis: [], list: null };
    }

    case 'reports': {
      const movements = summary?.recent_movements?.length ?? stockEntries.length;
      return {
        kpis: [
          { label: 'Recent Movements', value: movements, tab: 'reports' },
          { label: 'Audit Entries',    value: auditLogs.length, tab: 'audit-logs' },
        ],
        list: null,
      };
    }

    default:
      return { kpis: [], list: null };
  }
}

// ── Tone → color (classic) ────────────────────────────────────────────────────
const toneColor = (tone: Tone) =>
  tone === 'crit' ? '#cc0000' : tone === 'warn' ? '#c77800' : tone === 'ok' ? '#228822' : '#0058e6';

export default function SectionHomeView({ sectionKey }: { sectionKey: string }) {
  const data = useData();
  const router = useRouter();
  const { t } = useLanguage();
  const { uiStyle } = useTheme();
  const classic = uiStyle === 'classic';
  const { formatDate: tzDate } = useTimezone();

  const meta = SECTION_META[sectionKey];
  const section = useMemo(() => buildSection(sectionKey, data, tzDate), [sectionKey, data, tzDate]);
  // Quick links mirror the sidebar's children for this section (navConfig).
  const links = useMemo(
    () => (meta ? meta.items.map((i) => ({ label: navLabel(t, i), tab: i.tab, icon: i.icon })) : []),
    [meta, t]
  );

  // Unknown section → bounce to dashboard.
  useEffect(() => {
    if (!meta) router.replace('/dashboard');
  }, [meta, router]);
  if (!meta) return null;

  const go = (tab: string) => router.push(`/${tab}`);
  const toneCls = (tone: Tone) =>
    tone === 'crit' ? 'text-danger' : tone === 'warn' ? 'text-warning' : tone === 'ok' ? 'text-success' : 'text-primary';

  return (
    <div className="fade-in" style={classic ? { fontFamily: xpFont, fontSize: 11, background: '#ece9d8', padding: 4 } : undefined}>
      {/* title bar */}
      <div
        className={classic ? undefined : 'd-flex align-items-center gap-2 mb-3'}
        style={classic ? {
          background: ACCENT_GRAD[meta.accent], color: '#fff', fontWeight: 'bold', fontSize: 12,
          padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
          textShadow: '1px 1px 1px rgba(0,0,0,0.4)', border: '1px solid #003080',
        } : undefined}
      >
        <i className={`bi ${meta.icon}${classic ? '' : ' fs-4 text-primary'}`} aria-hidden="true" />
        {classic ? ` ${navLabel(t, meta)}` : <h4 className="fw-bold mb-0">{navLabel(t, meta)}</h4>}
      </div>

      {/* KPI strip */}
      {section.kpis.length > 0 && (
        <div
          className={classic ? undefined : 'row g-3 mb-4'}
          style={classic ? { display: 'grid', gridTemplateColumns: `repeat(${section.kpis.length},1fr)`, gap: 4, marginBottom: 6 } : undefined}
        >
          {section.kpis.map((k, i) => (
            classic ? (
              <div key={i}
                onClick={k.tab ? () => go(k.tab!) : undefined}
                style={{
                  border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
                  background: '#f5f4ef', textAlign: 'center', padding: '6px 4px',
                  cursor: k.tab ? 'pointer' : 'default',
                }}>
                <div style={{ fontSize: 22, fontWeight: 'bold', fontFamily: CODE_FONT, color: toneColor(k.tone), lineHeight: 1.1 }}>
                  {k.value}
                </div>
                <div style={{ fontSize: 8, color: '#444', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 2 }}>
                  {k.label}
                </div>
              </div>
            ) : (
              <div key={i} className="col-6 col-md-3">
                <div className={`card h-100 border-0 shadow-sm ${k.tab ? 'kpi-clickable' : ''}`}
                  onClick={k.tab ? () => go(k.tab!) : undefined}
                  role={k.tab ? 'button' : undefined}
                  style={k.tab ? { cursor: 'pointer' } : undefined}>
                  <div className="card-body p-3">
                    <div className="text-uppercase fw-bold text-muted mb-1" style={{ fontSize: '0.7rem' }}>{k.label}</div>
                    <h3 className={`fw-bold mb-0 ${toneCls(k.tone)}`}>{k.value}</h3>
                  </div>
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {/* list panel */}
      {section.list && (
        classic ? (
          <div style={{ border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', background: '#fff', marginBottom: 6 }}>
            <div style={{ ...lvThead(true), padding: '3px 8px', fontWeight: 'bold', fontSize: 11 }}>
              {section.list.title}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr>{section.list.cols.map((c, i) => (
                  <th key={i} style={{ background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '1px solid #b0aaa0', padding: '3px 6px', textAlign: 'left' }}>{c}</th>
                ))}</tr>
              </thead>
              <tbody>
                {section.list.rows.length === 0 && (
                  <tr><td colSpan={section.list.cols.length} style={{ padding: '10px', textAlign: 'center', color: '#888', fontStyle: 'italic' }}>No records</td></tr>
                )}
                {section.list.rows.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 ? '#f5f3ee' : '#fff' }}>
                    {r.code !== '' && <td style={{ padding: '3px 6px' }}><CodeChip code={r.code} classic /></td>}
                    <td style={{ padding: '3px 6px' }}>{r.primary}</td>
                    {r.status !== undefined && <td style={{ padding: '3px 6px' }}><StatusChip status={r.status} /></td>}
                    {r.right !== undefined && <td style={{ padding: '3px 6px', textAlign: 'right' }}>{r.right}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white"><h6 className="mb-0">{section.list.title}</h6></div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0 small">
                  <thead className="table-light"><tr>{section.list.cols.map((c, i) => <th key={i} className="px-3">{c}</th>)}</tr></thead>
                  <tbody>
                    {section.list.rows.length === 0 && (
                      <tr><td colSpan={section.list.cols.length} className="text-center py-4 text-muted">No records</td></tr>
                    )}
                    {section.list.rows.map((r, i) => (
                      <tr key={i}>
                        {r.code !== '' && <td className="px-3"><CodeChip code={r.code} classic={false} /></td>}
                        <td className="px-3">{r.primary}</td>
                        {r.status !== undefined && <td className="px-3"><StatusChip status={r.status} /></td>}
                        {r.right !== undefined && <td className="px-3 text-end">{r.right}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {/* quick links */}
      <div
        className={classic ? undefined : 'd-flex flex-wrap gap-2'}
        style={classic ? { display: 'flex', flexWrap: 'wrap', gap: 4 } : undefined}
      >
        {links.map((l) => (
          <button key={l.tab}
            className={classic ? undefined : 'btn btn-outline-primary btn-sm d-flex align-items-center gap-2'}
            onClick={() => go(l.tab)}
            style={classic ? {
              border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', background: '#ece9d8',
              padding: '5px 10px', fontFamily: xpFont, fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, color: '#00309c',
            } : undefined}>
            <i className={`bi ${l.icon}`} aria-hidden="true" /> {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
