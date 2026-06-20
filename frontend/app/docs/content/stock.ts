import { DocPage } from '../docsContent';

export const stockPage: DocPage = {
    slug: 'stock',
    title: 'Stock & Locations',
    subtitle: 'Track physical inventory across warehouse locations with a full transaction ledger.',
    badges: ['Locations', 'Categories', 'Stock Balances', 'Lots', 'Packaging Units', 'Ledger', 'Scanner', 'Transfers'],
    sections: [
        {
            heading: 'Locations',
            body: 'Locations represent physical storage areas within your facility — warehouses, bays, bins, or any named space. You can define as many locations as needed. Stock balances are maintained per item-variant-location combination, so the same item can have different quantities in different locations.',
        },
        {
            heading: 'Location Categories',
            body: 'Locations can be grouped under categories (e.g. Raw Materials, Finished Goods, WIP) for organisation. Categories are managed from a master-detail Locations screen — a category list on the left, the scoped locations on the right — and you can drag a location onto a category to reassign it. Categories are pure labels: deleting one simply uncategorises its locations and never blocks. Stock on Hand can be filtered and grouped by Location Category (and shows Item Category alongside it).',
            callout: {
                type: 'info',
                text: 'Categories appear only on the Locations and Stock on Hand screens. The stock-entry, transfer, goods-receipt, and manufacturing location pickers stay flat by design — locations remain the leaves that actually hold stock.',
            },
        },
        {
            heading: 'Stock Balances',
            body: 'Balances are materialised (pre-calculated) and stored in a dedicated `stock_balances` table. This provides O(1) lookups — there is no need to sum ledger entries on every read. Balances are updated atomically when stock entries are created, so the balance is always consistent with the ledger.',
        },
        {
            heading: 'Variant- & Lot-Level Tracking',
            body: 'Every stock balance is keyed by item ID, location ID, a variant key (a sorted, comma-joined string of selected AttributeValue UUIDs), and a lot key. This means stock is tracked separately for each variant combination — for example, "Red / Large" and "Blue / Large" of the same item have independent balances — and, for lot-tracked items, separately per lot.',
        },
        {
            heading: 'Lot Tracking',
            body: 'Any item can be marked lot-tracked. Lots (labelled "Lot" throughout the UI) give full genealogy from raw material to finished goods.',
            items: [
                'Output lots — completing a Work Order on a lot-tracked item auto-creates an output lot (prefix LOT-); beams get one too (prefix BM-). The number is auto-generated or entered manually.',
                'Input lots — when a WO consumes a lot-tracked material, the operator picks the specific lot per item line. Deducting a lot-tracked item without a lot is rejected.',
                'Goods receipt — lot-tracked items require the supplier\'s lot number at receipt; it is recorded against the received stock.',
                'Transfers — moving a lot-tracked item requires selecting the lot to move.',
                'Backward trace — the Origin view walks any lot back through the lots it consumed, hop by hop, to raw fibre.',
            ],
        },
        {
            heading: 'Beam Stock',
            body: 'Warp beams are a specialised lot. Each physical beam is a lot row carrying its warp ends and the Work Order that produced it. A beam is born when a BEAMING Work Order completes (auto number BM-YYYYMMDD-NNNN) and is consumed by a WEAVING Work Order. Remaining weight is read straight from the stock balance — see the Manufacturing page for the full beaming flow.',
        },
        {
            heading: 'Packaging Units',
            body: 'Alongside the base quantity, stock can carry cone, box, and drum counts as independent tallies. There is no forced unit conversion (no standard cone-to-kg) — the base quantity stays authoritative and the packaging counts move in parallel on goods receipt, transfers, and stock entries. Stock on Hand shows a compact "Packaging" column (e.g. 150 cones / 10 boxes / 4 drums) with only the non-zero counts.',
        },
        {
            heading: 'Stock Ledger',
            body: 'Every stock movement creates an immutable ledger entry. The ledger is the source of truth for all stock history. Entries are tagged with a transaction type — Receipt, Issue, Adjustment, Transfer, or Production (auto-deducted/posted by a completed Work Order). The ledger cannot be edited or deleted.',
        },
        {
            heading: 'Stock Entries',
            body: 'Stock entries are created manually for receipts, issues, and adjustments. Each entry specifies the item, variant, location, quantity (positive for in, negative for out), optional lot and packaging counts, and an optional reference note.',
        },
        {
            heading: 'Transfers',
            body: 'A stock transfer moves quantity from one location to another. Under the hood it creates two ledger entries — a negative entry at the source and a positive entry at the destination — so the total stock quantity across the system is preserved. Lot-tracked items require the lot to move, and packaging counts can be transferred alongside the base quantity.',
        },
        {
            heading: 'Scanner Terminal',
            body: 'The /scanner page is a mobile-optimised interface for the shop floor. Operators can use a barcode scanner or the device camera (via html5-qrcode) to scan Work Order QR codes, log completions (including consumed lots), and record stock movements without navigating the full desktop UI. Authentication and permissions apply as normal.',
        },
        {
            heading: 'Key Actions',
            items: [
                'Create and manage warehouse locations, and group them under location categories',
                'Mark items lot-tracked and capture lots on receipt, production, transfer, and consumption',
                'Record stock receipts, issues, and manual adjustments with optional lot and packaging counts',
                'Transfer stock between locations',
                'View current balance per item, variant, lot, and location',
                'Trace any lot back through its consumed inputs to origin',
                'Browse the full ledger history with filtering by item, location, type, and date',
                'Use the scanner terminal for QR-based Work Order logging on mobile devices',
            ],
        },
    ],
};
