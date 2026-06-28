'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'id';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const translations = {
    en: {
        'dashboard': 'Dashboard',
        // Sidebar
        'inventory': 'Inventory',
        'item_inventory': 'Item Inventory',
        'sample_masters': 'Sample Masters',
        'attributes': 'Attributes',
        'categories': 'Categories',
        'locations': 'Locations',
        'sales': 'Sales',
        'procurement': 'Procurement',
        'sales_orders': 'Sales Orders (SO)',
        'customers': 'Customers',
        'suppliers': 'Suppliers',
        'purchase_orders': 'Purchase Orders (PO)',
        'sample_requests': 'Sample Requests',
        'engineering': 'Engineering',
        'bom': 'Bill of Materials',
        'production_calendar': 'Production Calendar',
        'routing': 'Routing & Ops',
        'work_orders': 'Work Orders',
        'manufacturing_orders': 'Manufacturing Orders',
        'stock_adjustment': 'Stock Adjustment',
        'stock_on_hand': 'Stock On-Hand',
        'booking_stock': 'Booking Stock',
        'location': 'Location',
        'variant': 'Variant',
        'on_hand': 'On Hand',
        'incoming': 'Incoming',
        'required': 'Required',
        'net_free': 'Net Free',
        'all_locations': 'All Locations',
        'demand_from_mos': 'Required by',
        'incoming_from_mos': 'Incoming from',
        'reports': 'Reports',
        'stock_ledger': 'Stock Ledger',
        'settings': 'Settings',
        'account_settings': 'Account Settings',

        // Dashboard
        'smart_advisor': 'Smart Advisor',
        'warehouse_distribution': 'Warehouse Distribution',
        'production_deadlines': 'Production Deadlines',
        'recent_activity': 'Recent Activity',
        'manufacturing_monitoring': 'Manufacturing Monitoring',
        'kpi_trends': 'KPI Trends (30 days)',
        'recent_stock_movements': 'Recent Stock Movements',
        'work_order_monitoring': 'Work Order Monitoring',
        'action_items': 'Action Items',
        'stock_health': 'Stock Health',
        'production_health': 'Production Health',
        'order_health': 'Order Health',
        'production_yield': 'Production Yield',
        'delivery_readiness': 'Delivery Readiness',
        'low_stock': 'Low Stock',
        'active_wo': 'Active WO',
        'pending_wo': 'Pending WO',
        'samples': 'Samples',
        'open_orders': 'Open Orders',
        'total_skus': 'Total SKUs',
        'product': 'Product',
        'progress': 'Progress',
        'target': 'Target',
        'change': 'Change',
        'item': 'Item',
        'when': 'When',
        'code': 'Code',
        'reference': 'Reference',
        'system_balanced': 'System state is currently balanced.',
        'all_systems_nominal': 'All systems nominal',
        'no_inventory_recorded': 'No inventory recorded',
        'no_recent_movements': 'No recent movements',
        'no_active_production': 'No active production runs',
        'require_replenishment': 'require replenishment',
        'ready_for_release': 'ready for release',
        'material_shortages_affecting': 'Material shortages affecting',
        'of_orders': 'of orders',
        'view_details': 'View details',

        // Common
        'create': 'Create',
        'save': 'Save',
        'delete': 'Delete',
        'cancel': 'Cancel',
        'edit': 'Edit',
        'add': 'Add',
        'refresh': 'Refresh',
        'print': 'Print',
        'search': 'Search',
        'actions': 'Actions',
        'status': 'Status',
        'logout': 'Logout',
        'qty': 'Qty',
        'date': 'Date',
        'from': 'From',
        'to': 'To',
        
        // Locations
        'location_code': 'Code',
        'location_name': 'Name',

        // Items
        'item_code': 'Item Code',
        'item_name': 'Item Name',
        'uom': 'UOM',
        'source_sample': 'Source Sample',
        'weight_per_unit': 'Weight / Unit',
        
        // Manufacturing
        'production_schedule': 'Production Schedule',
        'new_production_run': 'New Production Run',
        'select_recipe': 'Select Recipe',
        'production_location': 'Production Location',
        'due_date': 'Due Date',
        'start': 'Start',
        'finish': 'Finish',
        'pending': 'PENDING',
        'in_progress': 'IN PROGRESS',
        'completed': 'COMPLETED',
        'cancelled': 'CANCELLED',
        
        // BOM
        'active_boms': 'Active BOMs',
        'create_recipe': 'Create Recipe',
        'finished_good': 'Finished Good',
        'materials': 'Materials',
        'routing_operations': 'Routing & Operations',
        
        // Routing
        'work_centers': 'Work Centers',
        'standard_operations': 'Standard Operations',
        'station_name': 'Station Name',
        'operation_name': 'Operation Name',
        
        // Work-center performance monitor
        'performance_monitor': 'Performance Monitor',
        'performance': 'Performance',
        'work_calendar': 'Calendar',
        'no_active_run': 'No active run on this machine.',
        'start_run': 'Start Run',
        'stop_run': 'Stop',
        'manufacturing_order': 'Manufacturing Order',
        'lines': 'Lines',
        'rate_per_line': 'g/min/line',
        'target_efficiency': 'Target Eff %',
        'start_date': 'Start Date',
        'target_100_day': 'Target 100%/day',
        'elapsed_days': 'Working days',
        'theoretical_100': 'Theoretical 100%',
        'actual_produced': 'Actual produced',
        'manual': 'manual',
        'efficiency': 'Efficiency',
        'on_target': 'on target',
        'below_target': 'below target',
        'actual_rate': 'Actual rate',
        'mo_completion': 'MO Completion Projection',
        'target_qty': 'Target qty',
        'total_actual': 'Total actual',
        'combined_target_rate': 'Combined target/day',
        'target_working_days': 'Target working days',
        'target_completion': 'Target completion',
        'projected_completion': 'Projected completion',
        'machines_on_mo': 'Machines on this MO',
        'run_history': 'Run History',
        'actual': 'Actual',
        'end': 'End',
        'working_days': 'Working Days',
        'working_days_hint': 'Days this machine runs. The working-day count and completion-date projection skip un-checked weekdays and the holidays below.',
        'holidays': 'Holidays',
        'note': 'Note',
        'no_holidays': 'No holidays set.',
        'targets': 'Targets',
        'weaving_monitor': 'Weaving Monitor',
        'machines': 'machines',
        'running': 'running',
        'idle': 'idle',
        'avg_efficiency': 'Avg efficiency',
        'loading': 'Loading...',
        'no_weaving_machines': 'No weaving machines defined. Add machines with type WEAVING in Routing.',
        'click_for_detail': 'Click for detail',
        'import_id_holidays': 'Import holidays',
        'today': 'Today',
        'working_day': 'Working day',
        'rest_day': 'Rest day',
        'national_holiday': 'National holiday',
        'holiday': 'Holiday',
        'click_to_add': 'click to add',
        'calendar_click_hint': 'Click a day to mark / unmark it as a holiday for this machine. ★ = Indonesian national holiday.',
        // Headers
        'powered_by': 'Powered by',
    },
    id: {
        'dashboard': 'Dasbor',
        // Sidebar
        'inventory': 'Inventaris',
        'item_inventory': 'Daftar Barang',
        'sample_masters': 'Master Sampel',
        'attributes': 'Atribut',
        'categories': 'Kategori',
        'locations': 'Lokasi',
        'sales': 'Penjualan',
        'procurement': 'Pengadaan',
        'sales_orders': 'Pesanan Penjualan (SO)',
        'customers': 'Pelanggan',
        'suppliers': 'Pemasok',
        'purchase_orders': 'Pesanan Pembelian (PO)',
        'sample_requests': 'Permintaan Sampel',
        'engineering': 'Teknik',
        'bom': 'Resep Produksi (BOM)',
        'production_calendar': 'Kalender Produksi',
        'work_orders': 'Perintah Kerja (WO)',
        'manufacturing_orders': 'Perintah Produksi (MO)',
        'routing': 'Routing & Operasi',
        'stock_adjustment': 'Penyesuaian Stok',
        'stock_on_hand': 'Stok Tersedia',
        'booking_stock': 'Stok Booking',
        'location': 'Lokasi',
        'variant': 'Varian',
        'on_hand': 'Tersedia',
        'incoming': 'Masuk',
        'required': 'Dibutuhkan',
        'net_free': 'Sisa Bebas',
        'all_locations': 'Semua Lokasi',
        'demand_from_mos': 'Dibutuhkan oleh',
        'incoming_from_mos': 'Masuk dari',
        'reports': 'Laporan',
        'stock_ledger': 'Buku Besar Stok',
        'settings': 'Pengaturan',
        'account_settings': 'Pengaturan Akun',

        // Dashboard
        'smart_advisor': 'Penasihat Cerdas',
        'warehouse_distribution': 'Distribusi Gudang',
        'production_deadlines': 'Tenggat Produksi',
        'recent_activity': 'Aktivitas Terkini',
        'manufacturing_monitoring': 'Pemantauan Produksi',
        'kpi_trends': 'Tren KPI (30 hari)',
        'recent_stock_movements': 'Pergerakan Stok Terkini',
        'work_order_monitoring': 'Pemantauan Perintah Kerja',
        'action_items': 'Daftar Tindakan',
        'stock_health': 'Kesehatan Stok',
        'production_health': 'Kesehatan Produksi',
        'order_health': 'Kesehatan Pesanan',
        'production_yield': 'Hasil Produksi',
        'delivery_readiness': 'Kesiapan Pengiriman',
        'low_stock': 'Stok Rendah',
        'active_wo': 'WO Aktif',
        'pending_wo': 'WO Tertunda',
        'samples': 'Sampel',
        'open_orders': 'Pesanan Terbuka',
        'total_skus': 'Total SKU',
        'product': 'Produk',
        'progress': 'Progres',
        'target': 'Target',
        'change': 'Perubahan',
        'item': 'Barang',
        'when': 'Waktu',
        'code': 'Kode',
        'reference': 'Referensi',
        'system_balanced': 'Kondisi sistem saat ini seimbang.',
        'all_systems_nominal': 'Semua sistem normal',
        'no_inventory_recorded': 'Tidak ada inventaris tercatat',
        'no_recent_movements': 'Tidak ada pergerakan terkini',
        'no_active_production': 'Tidak ada produksi aktif',
        'require_replenishment': 'perlu pengisian ulang',
        'ready_for_release': 'siap dirilis',
        'material_shortages_affecting': 'Kekurangan material memengaruhi',
        'of_orders': 'dari pesanan',
        'view_details': 'Lihat detail',

        // Common
        'create': 'Buat',
        'save': 'Simpan',
        'delete': 'Hapus',
        'cancel': 'Batal',
        'edit': 'Ubah',
        'add': 'Tambah',
        'refresh': 'Segarkan',
        'print': 'Cetak',
        'search': 'Cari',
        'actions': 'Aksi',
        'status': 'Status',
        'logout': 'Keluar',
        'qty': 'Jml',
        'date': 'Tanggal',
        'from': 'Dari',
        'to': 'Sampai',
        
        // Locations
        'location_code': 'Kode',
        'location_name': 'Nama',

        // Items
        'item_code': 'Kode Barang',
        'item_name': 'Nama Barang',
        'uom': 'Satuan',
        'source_sample': 'Sampel Sumber',
        'weight_per_unit': 'Berat / Satuan',
        
        // Manufacturing
        'production_schedule': 'Jadwal Produksi',
        'new_production_run': 'Jalan Produksi Baru',
        'select_recipe': 'Pilih Resep',
        'production_location': 'Lokasi Produksi',
        'due_date': 'Tenggat Waktu',
        'start': 'Mulai',
        'finish': 'Selesai',
        'pending': 'TUNDA',
        'in_progress': 'DIPROSES',
        'completed': 'SELESAI',
        'cancelled': 'BATAL',
        
        // BOM
        'active_boms': 'Daftar Resep Aktif',
        'create_recipe': 'Buat Resep',
        'finished_good': 'Barang Jadi',
        'materials': 'Bahan Baku',
        'routing_operations': 'Alur & Operasi',
        
        // Routing
        'work_centers': 'Pusat Kerja (Stasiun)',
        'standard_operations': 'Operasi Standar',
        'station_name': 'Nama Stasiun',
        'operation_name': 'Nama Operasi',
        
        // Work-center performance monitor
        'performance_monitor': 'Monitor Performa',
        'performance': 'Performa',
        'work_calendar': 'Kalender',
        'no_active_run': 'Tidak ada run aktif di mesin ini.',
        'start_run': 'Mulai Run',
        'stop_run': 'Stop',
        'manufacturing_order': 'Manufacturing Order',
        'lines': 'Line',
        'rate_per_line': 'gr/menit/line',
        'target_efficiency': 'Target Efisiensi %',
        'start_date': 'Tanggal Mulai',
        'target_100_day': 'Target 100%/hari',
        'elapsed_days': 'Hari kerja',
        'theoretical_100': 'Teoritis 100%',
        'actual_produced': 'Hasil aktual',
        'manual': 'manual',
        'efficiency': 'Efisiensi',
        'on_target': 'capai target',
        'below_target': 'di bawah target',
        'actual_rate': 'Laju aktual',
        'mo_completion': 'Proyeksi Penyelesaian MO',
        'target_qty': 'Target qty',
        'total_actual': 'Total aktual',
        'combined_target_rate': 'Target gabungan/hari',
        'target_working_days': 'Target hari kerja',
        'target_completion': 'Target selesai',
        'projected_completion': 'Proyeksi selesai',
        'machines_on_mo': 'Mesin pada MO ini',
        'run_history': 'Riwayat Run',
        'actual': 'Aktual',
        'end': 'Selesai',
        'working_days': 'Hari Kerja',
        'working_days_hint': 'Hari mesin ini berjalan. Hitungan hari kerja dan proyeksi tanggal selesai mengabaikan hari yang tidak dicentang dan hari libur di bawah.',
        'holidays': 'Hari Libur',
        'note': 'Catatan',
        'no_holidays': 'Belum ada hari libur.',
        'targets': 'Target',
        'weaving_monitor': 'Monitor Tenun',
        'machines': 'mesin',
        'running': 'jalan',
        'idle': 'idle',
        'avg_efficiency': 'Rata-rata efisiensi',
        'loading': 'Memuat...',
        'no_weaving_machines': 'Belum ada mesin tenun. Tambah mesin tipe WEAVING di Routing.',
        'click_for_detail': 'Klik untuk detail',
        'import_id_holidays': 'Impor libur',
        'today': 'Hari ini',
        'working_day': 'Hari kerja',
        'rest_day': 'Libur mingguan',
        'national_holiday': 'Libur nasional',
        'holiday': 'Libur',
        'click_to_add': 'klik untuk tambah',
        'calendar_click_hint': 'Klik tanggal untuk menandai / membatalkan hari libur mesin ini. ★ = libur nasional Indonesia.',
        // Headers
        'powered_by': 'Ditenagai oleh',
    }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguage] = useState<Language>('en');

    useEffect(() => {
        const savedLang = localStorage.getItem('app_language') as Language;
        if (savedLang && (savedLang === 'en' || savedLang === 'id')) {
            setLanguage(savedLang);
        }
    }, []);

    const handleSetLanguage = (lang: Language) => {
        setLanguage(lang);
        localStorage.setItem('app_language', lang);
    };

    const t = (key: string) => {
        return translations[language][key as keyof typeof translations['en']] || key;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) throw new Error('useLanguage must be used within LanguageProvider');
    return context;
};
