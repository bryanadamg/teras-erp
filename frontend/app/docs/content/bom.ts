import { DocPage } from '../docsContent';

export const bomPage: DocPage = {
    slug: 'bom',
    title: 'BOM Designer',
    subtitle: 'Build recursive, multi-level Bills of Materials for any manufactured product.',
    badges: ['Recursive BOM', 'Assemblies', 'Routing', 'Percentage Qty', 'Variant BOMs', 'Automator'],
    sections: [
        {
            heading: 'What is a BOM?',
            body: 'A Bill of Materials (BOM) defines the components and sub-assemblies required to manufacture a finished product. Teras ERP supports recursive BOMs — a component can itself have a BOM, enabling multi-level assembly trees of arbitrary depth. The designer renders the full tree structure with expand/collapse navigation.',
        },
        {
            heading: 'Creating a BOM',
            body: 'Navigate to BOM Designer and click New BOM. Select the finished good item, set the output quantity, and begin adding component lines. Each line references an item (with optional variant attributes), a quantity or percentage, and a source location override if needed.',
        },
        {
            heading: 'Percentage-Based Quantities',
            body: 'Component quantities can be expressed as a percentage of the parent item\'s output quantity instead of a fixed value. This is the mechanism for linking sub-assemblies: a line with a non-zero percentage signals that the referenced item is itself a manufactured sub-assembly whose quantity scales proportionally with the parent batch size. Lines with a fixed quantity (percentage = 0) are treated as raw material inputs consumed directly at completion.',
        },
        {
            heading: 'Variant BOMs — Color and Attribute Variants',
            body: 'When a finished good has attribute variants (e.g. Colour = Black-218, Colour = Red-X), each variant gets its own BOM. The BOM is tagged with the specific attribute values it produces via the Attribute Values selector on BOM creation. All variant BOMs for the same item share the same base recipe — the base sub-assembly (greige) appears as a percentage line pointing to a single shared BOM. Only the variant-specific additions (such as a colorant or finish) differ between variant BOMs.\n\nExample: BOM-A-Black-218 (produces Item-A with Colour=Black-218) has two lines — Item-B at 80% (the shared greige sub-assembly) and Black-218 Dye at a fixed 5 m. BOM-A-Red-X has the same Item-B line at 80% plus Red-X Dye at 5 m. Item-B has its own BOM defining its recipe (Yarn, Sizing Agent, etc.).',
        },
        {
            heading: 'BOM Sizes',
            body: 'A single BOM can define multiple size variants via BOM Sizes. Each size entry carries a label (e.g. "S", "M", "L", "XL"), an optional physical measurement range, and a link to a system Size record. When a Production Run is created from a sized BOM, one Manufacturing Order is generated per size. The quantity for each size is set at Production Run creation time — sizes with a zero quantity are skipped.',
        },
        {
            heading: 'Wastage Tolerances',
            body: 'A tolerance percentage can be set on a BOM to account for expected material wastage. The system multiplies all component requirements by (1 + tolerance / 100) when performing stock availability checks and material requirement calculations. This ensures purchase and production planning accounts for realistic consumption rather than theoretical minimums.',
        },
        {
            heading: 'Inline Editing',
            body: 'Quantity and percentage values are directly editable in the BOM tree view — no separate modal is required. Click any quantity or percentage cell to edit it in place. Changes are saved on blur or Enter.',
        },
        {
            heading: 'Root-Only Filter',
            body: 'The BOM list view has a "Root Only" toggle that filters the list to show only top-level finished goods BOMs, hiding intermediate sub-assembly BOMs. This keeps the list manageable when many sub-assemblies are defined.',
        },
        {
            heading: 'Print at Any Level',
            body: 'Any node in a BOM tree can be printed as a standalone A4 BOM sheet. The printout includes the selected node as the root, its direct components, quantities, and routing steps. This allows shop floor operators to have targeted, level-specific production sheets rather than printing the entire tree.',
        },
        {
            heading: 'Routing',
            body: 'Each BOM can include a routing — an ordered list of manufacturing operations (e.g. "Cut", "Sew", "QC", "Pack"). Routing steps are defined under Settings → Routing and reference work centres. Routing steps appear on printed work orders and are used by the MES interface for operation-level tracking.',
        },
        {
            heading: 'BOM Automator',
            body: 'The BOM Automator is a wizard that analyses a Manufacturing Order\'s BOM tree and automatically generates child Work Orders for every sub-assembly level. It matches the component attribute values to the correct child BOMs and creates a linked MO hierarchy in a single operation. This eliminates the need to manually create sub-assembly orders one by one.',
        },
        {
            heading: 'Attribute Inheritance',
            body: 'When a finished goods item has attributes (e.g. Colour, Size), the BOM Designer propagates those attribute values down to relevant component lines. For example, if you are producing a "Blue / Large" shirt, the fabric component line will automatically filter to the "Blue" variant of the fabric item.',
        },
        {
            heading: 'Key Actions',
            items: [
                'Create BOMs for finished goods, sub-assemblies, and attribute variants',
                'Tag a BOM with specific attribute values (e.g. Colour = Black-218) to identify which variant it produces',
                'Add components with fixed quantities (raw materials) or percentage-based ratios (sub-assemblies)',
                'Define BOM Sizes (S, M, L, XL) so one Production Run creates per-size Manufacturing Orders automatically',
                'Set wastage tolerance to inflate material requirements for realistic planning',
                'Edit quantities and percentages inline without opening a modal',
                'Toggle root-only view to hide sub-assembly BOMs from the list',
                'Print a BOM sheet for any level of the assembly tree',
                'Attach routing steps with work centre assignments',
                'Run the BOM Automator to generate child Work Orders for all sub-assembly levels',
            ],
        },
    ],
};
