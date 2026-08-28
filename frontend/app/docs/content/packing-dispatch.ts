import { DocPage } from '../docsContent';

export const packingDispatchPage: DocPage = {
    slug: 'packing-dispatch',
    title: 'Packing & Dispatch',
    subtitle: 'Pack finished goods into cartons, pull them onto a pick list, and dispatch them under a two-person check.',
    badges: ['Packing Orders', 'Pick Lists', 'Shipments', 'Four-Eyes Check', 'Surat Jalan'],
    sections: [
        {
            heading: 'Three Documents, Three Roles',
            body: 'Getting finished goods out the door runs through three separate documents, each owned by a different person on the floor. They chain together, but each has its own screen and its own job:',
            steps: [
                'Packing Order — turns bulk finished goods (plus any packaging materials used) into physical cartons. Owned by the packer.',
                'Pick List — pulls specific, already-packed cartons for a Sales Order. Owned by the picker.',
                'Shipment — the loading-deck handover: one delivery note covering one or more pick lists for a single customer. Owned by the person staging the truck and, separately, the person who counts it.',
            ],
        },
        {
            heading: 'Packing Orders',
            body: 'A Packing Order consumes bulk stock — finished goods, plus any packaging materials consumed along the way — from a source location, and produces PackedUnit cartons: physical cartons or rolls, each one a fully lot-traceable item in its own right. Cartons are entered as count × qty-each rather than one row per box, and every carton records a weighed net weight.',
            callout: {
                type: 'info',
                text: 'Linking a Packing Order to a Sales Order is optional and only a tag. You can pack straight to stock with no SO at all, and a carton packed against one SO is still fair game for any pick list — the link is a soft reservation, not a hold.',
            },
        },
        {
            heading: 'Quarantined Material',
            body: 'A lot sitting in a quarantine location cannot be pulled into a packing order until its Quarantine Status reads "OK" on the Quarantine Packing desk — see Quality & Quarantine. This check runs at the moment of packing, so a lot released after packing already started is picked up correctly, and one that regresses is blocked before it reaches a carton.',
        },
        {
            heading: 'Pick Lists',
            body: 'A Pick List is the internal pull instruction for one Sales Order: it draws named PackedUnit cartons out of stock against the order\'s lines and ends at status PICKED. Each line is keyed to a specific (SO line, carton) pair and gates on a QC-passed flag before it can be scanned in.',
            items: [
                'One Sales Order can have several pick lists over time — this is how a partial shipment works.',
                'Cartons are pulled by scanning their carton code, matching the same scan-driven pattern used across the shop floor.',
                'A Pick List no longer dispatches stock itself — reaching PICKED only means the cartons are gathered and ready; the goods have not left the building yet.',
            ],
        },
        {
            heading: 'Shipments — The Loading-Deck Gate',
            body: 'A Shipment is the actual handover: one Surat Jalan (delivery note) grouping one or more PICKED pick lists for a single customer. This is the only point where finished-goods stock is posted out and the pick lists it carries are marked DISPATCHED.',
            table: {
                headers: ['Status', 'What happened', 'Who moves it'],
                rows: [
                    ['Draft', 'Pick lists are being gathered onto the shipment', 'Loading-deck staff'],
                    ['Staged', 'Goods are physically on the loading deck; the Surat Jalan is printed', 'The person staging the truck'],
                    ['Verified', 'A second, different person has counted the cartons against the printed note', 'A different verifier — never the same person who staged it'],
                    ['Dispatched', 'Goods-issue stock movement is posted; the truck leaves', 'Whoever confirms dispatch'],
                ],
            },
            callout: {
                type: 'warning',
                text: 'Staging and verifying are deliberately split between two different people — the four-eyes check. The system will not let the same user both print the Surat Jalan and confirm the carton count against it.',
            },
        },
        {
            heading: 'Delivery Note Numbering',
            body: 'The Surat Jalan number is generated automatically when a shipment is staged, but it stays editable — the client\'s own paper delivery-note series predates this system, so a shipment can be given the matching paper number by hand when needed.',
        },
        {
            heading: 'What Dispatch Actually Does',
            body: 'Only the final Dispatch action moves stock and status. It posts the finished-goods goods-issue movement, flips every pick list on the shipment to DISPATCHED, and — once every line on the Sales Order has been fully dispatched — moves the order itself to Sent. Staging and verifying move no stock at all; a shipment can sit at Staged or Verified indefinitely without anything having left the ledger.',
        },
        {
            heading: 'Sales Order Fulfilment Status',
            body: 'A Sales Order\'s status is calculated, not set by hand, from four numbers on every line: how much has been produced, how much has ever been packed, how much packed stock is still actually on hand, and how much has been dispatched. A line only counts as ready to ship once packed cartons are physically on hand — finishing the loom run is not enough by itself.',
            table: {
                headers: ['Status', 'Meaning'],
                rows: [
                    ['Pending', 'No line has enough packed, on-hand stock to ship yet'],
                    ['Ready', 'Every line has enough packed stock on hand to fulfil it'],
                    ['Partial', 'Some, but not all, lines are ready or have shipped'],
                    ['Sent', 'Every line has been fully dispatched via a shipment'],
                ],
            },
        },
        {
            heading: 'Key Actions',
            items: [
                'Pack bulk finished goods (and packaging materials) into weighed, lot-traceable cartons, with or without an SO tag',
                'Pull specific cartons onto a pick list against a Sales Order, gated on QC pass',
                'Split a shipment across several partial pick lists as stock becomes available',
                'Stage a shipment and print its Surat Jalan, then have a different person verify the carton count',
                'Dispatch a verified shipment to post the goods-issue movement and mark its pick lists DISPATCHED',
                'Edit the auto-generated delivery note number to match the client\'s own paper series',
                'Track Sales Order fulfilment automatically from produced, packed, on-hand, and dispatched quantities per line',
            ],
        },
    ],
};
