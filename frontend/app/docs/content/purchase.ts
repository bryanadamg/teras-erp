import { DocPage } from '../docsContent';

export const purchasePage: DocPage = {
    slug: 'purchase',
    title: 'Purchase Orders',
    subtitle: 'Manage supplier orders and goods receipts to replenish inventory.',
    badges: ['Suppliers', 'PO', 'Goods Receipt', 'Delivery Note', 'Packaging Units', 'Auto Stock Update'],
    sections: [
        {
            heading: 'Suppliers (Partners)',
            body: 'Suppliers are managed under the Partners module alongside customers. Each supplier record holds the company name, contact person, address, phone, and email. A partner can act as both a customer and a supplier.',
        },
        {
            heading: 'Creating a Purchase Order',
            body: 'A Purchase Order (PO) is raised to a supplier for specific items and quantities. The PO header contains the supplier, order date, and expected delivery date. Line items reference the inventory catalogue so that receipts automatically update the correct item balances, and can carry packaging quantities (cones, boxes, drums) in addition to the base quantity.',
        },
        {
            heading: 'Goods Receipt (GRN)',
            body: 'When goods arrive, you record a receipt against the Purchase Order. Each line can be received in full or partially and captures packaging counts and, for lot-tracked items, the supplier\'s lot number. The receipt creates stock ledger entries (of type Receipt) and atomically updates the `stock_balances` table for the received items at the designated target location.',
        },
        {
            heading: 'Delivery Note (Surat Jalan)',
            body: 'Each receipt records the supplier\'s delivery note / Surat Jalan at the header level — one delivery, one delivery note, one receipt covering its lines:',
            items: [
                'Delivery Note Number — the supplier\'s own reference (free text, not validated for uniqueness).',
                'Delivery Note Date — the date on the note (ship date), distinct from the receipt date when you booked it in.',
                'Attachment — a scanned PDF or image of the note, uploaded with the receipt and openable later via a "View DN" link.',
            ],
            callout: {
                type: 'info',
                text: 'The receipt history lists each delivery as its own row showing the DN number, DN date, the View DN link, and the received quantities (with cone/box/drum columns shown only when present).',
            },
        },
        {
            heading: 'Automated Stock Update',
            body: 'The one-click "Receive" workflow removes the need for a separate stock entry step. Receiving a PO line immediately increments the item balance (and any packaging counts) at the specified warehouse location, making the stock available for production and fulfilment instantly.',
        },
        {
            heading: 'Order Statuses',
            items: [
                'Draft — being prepared, not yet sent to supplier',
                'Sent — issued to supplier; awaiting delivery',
                'Partially Received — some lines received, remainder outstanding',
                'Received — all lines received and closed',
                'Cancelled — withdrawn before receipt',
            ],
            callout: {
                type: 'tip',
                text: 'A partially-fulfilled PO can be force-closed when the remainder will not be delivered, without having to receive the outstanding quantity.',
            },
        },
        {
            heading: 'Print Templates',
            body: 'Each Purchase Order has an A4 print template with the supplier\'s name and address (auto-resolved from the partner record), all line items with descriptions and quantities, and order totals. Suitable for emailing or printing for supplier acknowledgement.',
        },
        {
            heading: 'Key Actions',
            items: [
                'Create and manage supplier (partner) records',
                'Raise Purchase Orders with multiple line items and packaging quantities',
                'Record full or partial goods receipts against PO lines, with supplier lots for lot-tracked items',
                'Capture the supplier delivery note (number, date, and scanned attachment) per receipt',
                'Auto-update stock balances and packaging counts at the target location on receipt',
                'Track PO status from Draft through to fully Received, and force-close a partial PO',
                'Print purchase order documents for supplier confirmation',
            ],
        },
    ],
};
