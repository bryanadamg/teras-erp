import { DocPage } from '../docsContent';

export const bomPage: DocPage = {
    slug: 'bom',
    title: 'BOM Designer',
    subtitle: 'Build recursive, multi-level Bills of Materials for any manufactured product.',
    badges: ['Recursive BOM', 'Assemblies', 'Routing', 'Percentage Qty', 'Variant BOMs', 'Sizes'],
    sections: [
        {
            heading: 'What is a BOM?',
            body: 'A Bill of Materials (BOM) defines the components and sub-assemblies required to manufacture a finished product. Teras ERP supports recursive BOMs — a component can itself have a BOM, enabling multi-level assembly trees of arbitrary depth. The designer renders the full tree structure with expand/collapse navigation.',
        },
        {
            heading: 'Component Line Types',
            body: 'Every BOM line is one of two types, determined by how its quantity is expressed:',
            columns: [
                {
                    label: 'Sub-Assembly (Percentage > 0)',
                    items: [
                        'Quantity is a % of the parent batch size',
                        'Signals that this component is itself manufactured',
                        'The system looks up an active BOM for this item',
                        'Creates a child Manufacturing Order at run time',
                        'Scales automatically with any batch size',
                        'Example: Item-B at 80% — produce 80 units of Item-B for every 100 of Item-A',
                    ],
                },
                {
                    label: 'Raw Material (Fixed Qty)',
                    items: [
                        'Quantity is a fixed amount per batch',
                        'Component is consumed directly at MO completion',
                        'No child BOM or child MO is created',
                        'Deducted from stock when the MO is completed',
                        'Example: Black-218 Dye at 5 m — always 5 m per batch regardless of size',
                    ],
                },
            ],
        },
        {
            heading: 'BOM Structure — Single-Level Example',
            body: 'A finished good BOM for Item-A might look like this:',
            code:
`BOM-A  →  produces: Item-A  (output qty: 1 roll)
  ├─ Item-B        percentage: 80%   [sub-assembly — has its own BOM]
  └─ Packaging     qty: 1 pc         [raw material — consumed at completion]

BOM-B  →  produces: Item-B  (output qty: 1 roll)
  ├─ Yarn-White    percentage: 60%   [sub-assembly]
  └─ Sizing Agent  qty: 0.5 kg       [raw material]`,
            callout: {
                type: 'info',
                text: 'A BOM line with percentage > 0 triggers automatic child MO creation at Production Run time. The system finds the active BOM for that item and recursively expands it.',
            },
        },
        {
            heading: 'Variant BOMs — Colour and Attribute Variants',
            body: 'When a finished good has attribute variants (e.g. Colour = Black-218, Colour = Red-X), each variant gets its own BOM tagged with its specific attribute values. All variant BOMs share the same base sub-assembly line — only the variant-specific additions differ.',
            code:
`BOM-A-Black-218  →  Item-A  [Colour = Black-218]
  ├─ Item-B           80%    [shared greige — same BOM-B for all colours]
  └─ Black-218 Dye    5 m    [variant-specific raw material]

BOM-A-Red-X      →  Item-A  [Colour = Red-X]
  ├─ Item-B           80%    [same shared BOM-B]
  └─ Red-X Dye        5 m    [variant-specific raw material]

BOM-B            →  Item-B  [no variant — single shared recipe]
  ├─ Yarn-White       60%
  └─ Sizing Agent     0.5 kg`,
            callout: {
                type: 'tip',
                text: 'You do not need a separate Item-B per colour variant. One BOM-B covers all colours. The Production Run consolidation engine handles the aggregation automatically — see the Manufacturing page for details.',
            },
        },
        {
            heading: 'BOM Sizes',
            body: 'A single BOM can define multiple physical size variants via BOM Sizes. Each size entry carries a label, an optional measurement range (min/max), and a link to a system Size record. When a Production Run is created from a sized BOM, one Manufacturing Order is generated per size. Sizes with a zero quantity are skipped.',
            table: {
                headers: ['Size Label', 'Measurement Range', 'Use Case'],
                rows: [
                    ['S',  '50 – 55 cm', 'Small physical dimension'],
                    ['M',  '56 – 61 cm', 'Medium physical dimension'],
                    ['L',  '62 – 67 cm', 'Large physical dimension'],
                    ['XL', '68 – 73 cm', 'Extra-large physical dimension'],
                ],
            },
            callout: {
                type: 'info',
                text: 'BOM Sizes handle physical size variants (S/M/L/XL). Colour or attribute variants are handled by separate BOMs with attribute value tags — these two mechanisms work together in a single Production Run.',
            },
        },
        {
            heading: 'Wastage Tolerances',
            body: 'A tolerance percentage set on a BOM inflates all component requirements by (1 + tolerance / 100) during stock availability checks and material requirement planning. This accounts for expected process wastage without requiring manual adjustment of individual line quantities.',
        },
        {
            heading: 'Routing',
            body: 'Each BOM can include a routing — an ordered list of manufacturing operations (e.g. "Warp", "Weave", "Dye", "QC", "Pack"). Routing steps reference work centres defined under Settings → Routing. Steps appear on printed work orders and are used by the MES interface for operation-level progress tracking.',
        },
        {
            heading: 'BOM Automator',
            body: 'The BOM Automator analyses a BOM tree and automatically generates the child Manufacturing Orders for every sub-assembly level. It matches component attribute values to the correct child BOMs and creates a linked MO hierarchy in a single operation — eliminating the need to create sub-assembly orders one by one. Automator defaults follow each item\'s own unit of measure, and the wizard\'s settings are saved per user.',
        },
        {
            heading: 'Key Actions',
            items: [
                'Create BOMs for finished goods, sub-assemblies, and per-attribute-variant products',
                'Tag a BOM with specific attribute values (e.g. Colour = Black-218) to identify what variant it produces',
                'Add percentage lines for sub-assemblies — these expand into child MOs at production time',
                'Add fixed-qty lines for raw materials — these are consumed directly at MO completion',
                'Define BOM Sizes (S/M/L/XL) so one Production Run creates per-size Manufacturing Orders',
                'Set wastage tolerance to inflate material requirements for realistic planning',
                'Edit quantities and percentages inline in the BOM tree — no modal required',
                'Toggle root-only view to hide sub-assembly BOMs from the list',
                'Print a BOM sheet for any level of the assembly tree',
                'Attach routing steps with work centre assignments',
                'Run the BOM Automator to generate child Manufacturing Orders for all sub-assembly levels',
            ],
        },
    ],
};
