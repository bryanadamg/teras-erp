import { DocPage } from '../docsContent';

export const salesOrdersPage: DocPage = {
    slug: 'sales-orders',
    title: 'Sales Orders',
    subtitle: 'Capture and manage customer demand from creation through fulfilment.',
    badges: ['Customers', 'Orders', 'Variants', 'BOM Link', 'Produce-to-Order', 'Lineage'],
    sections: [
        {
            heading: 'Customers (Partners)',
            body: 'Customers are managed under the Partners module. Each customer record holds the company name, contact person, address, phone, email, and order history. The same Partners directory is shared with Suppliers — a record can be both a customer and a supplier.',
        },
        {
            heading: 'Creating a Sales Order',
            body: 'A Sales Order (SO) captures what a customer wants, in what quantities, at what price, and by when. The SO header contains the customer, order date, and expected delivery date. Each line item references a specific item from the inventory catalogue. An existing SO can be edited after creation to adjust lines and quantities.',
        },
        {
            heading: 'Variant & Size Selection',
            body: 'When adding a line item, if the selected item has attributes (e.g. Colour, Size), a size/variant selector appears. The SO line records the specific variant requested by the customer. This variant is passed through to any Manufacturing Order created from that line, ensuring the correct variant is produced.',
        },
        {
            heading: 'BOM Link',
            body: 'Each SO line can be linked to a specific BOM. When the "Produce" button is clicked for that line, the system creates a Manufacturing Order pre-populated with the linked BOM, the requested variant, and the ordered quantity. This creates a direct traceability chain from customer order to production.',
        },
        {
            heading: 'Produce-to-Order',
            body: 'The SO view shows an individual "Produce" button for each line item. Clicking it opens an MO creation modal pre-filled with the line\'s item, variant, quantity, and BOM link. This allows selective production — you can produce line 1 now and line 2 later — without creating the entire SO\'s production at once.',
        },
        {
            heading: 'Production Lineage',
            body: 'Every order can be traced down through what it set in motion. A "Lineage" button on each SO (shown once production exists) opens a tree of the order\'s Production Runs, Manufacturing Orders, Work Orders, and beams. SO badges also appear across the Production Run, Manufacturing Order, and lot screens, so any produced lot ties back to its originating order. Shared component MOs — which have no direct SO — resolve their origin via the Production Run.',
        },
        {
            heading: 'Order Statuses',
            body: 'Fulfilment status is calculated automatically from production, packing, and dispatch progress — it is never set by hand. Cancelled is the only status a user sets directly.',
            items: [
                'Pending — no line yet has enough packed, on-hand stock to ship',
                'Ready — every line has enough packed stock physically on hand to fulfil it',
                'Partial — some lines are ready or have shipped, others are not',
                'Sent — every line has been fully dispatched through a Shipment',
                'Cancelled — withdrawn before fulfilment',
            ],
            callout: {
                type: 'info',
                text: 'An order only reaches Ready once packed cartons are actually in stock — finishing the production run alone is not enough. See Packing & Dispatch for the full Packing Order → Pick List → Shipment flow that drives this status.',
            },
        },
        {
            heading: 'Print Templates',
            body: 'Each Sales Order has an A4 print template that includes the customer\'s name and address (auto-resolved from the partner record), all line items with variant specifications, quantities, prices, and totals. A full SO table printout is also available for batch summaries.',
        },
        {
            heading: 'Key Actions',
            items: [
                'Create and manage customer (partner) records',
                'Raise Sales Orders with multiple line items',
                'Select size/variant per line when applicable',
                'Link each SO line to a specific BOM for produce-to-order',
                'Click the per-line "Produce" button to create a linked Manufacturing Order',
                'Edit an existing order to adjust its lines and quantities',
                'Open the Lineage view to trace an order down to its MOs, WOs, and beams',
                'Track fulfilment status at the order and line level, driven automatically by packing and dispatch progress',
                'Fulfil the order through Packing & Dispatch — pack cartons, pick them, and dispatch a shipment',
                'Print individual SO documents or batch table summaries',
            ],
        },
    ],
};
