import { DocPage } from '../docsContent';

export const dyeingSettingPage: DocPage = {
    slug: 'dyeing-setting',
    title: 'Dyeing & Setting',
    subtitle: 'Manage dye recipes, execute dyeing runs, and record heat-setting operations — from Kartu Celup to batch output.',
    badges: ['Lab Dips', 'Dye Recipes', 'Dyeing Runs', 'Setting Runs', 'Kartu Celup', 'Bak Cuci', 'Chemical Tracking', 'Batch Traceability'],
    sections: [
        {
            heading: 'Overview',
            body: 'The Dyeing & Setting module covers two distinct process stages in textile wet processing: dyeing (applying colour to substrate using dye chemicals and auxiliaries) and setting (heat-treating the dyed fabric to stabilise dimensions and GSM). Both stages are linked to Work Orders at specific work centres and produce output batches that feed the next stage.',
            callout: {
                type: 'info',
                text: 'Work centres must be configured with the correct center_type (DYEING or SETTING) in Routing settings. Only work orders at a DYEING work centre appear in the Dyeing Orders tab; only SETTING work orders appear in the Setting Orders tab.',
            },
        },
        {
            heading: 'Module Layout',
            body: 'Navigate to Dyeing & Setting from the sidebar. The page has three tabs:',
            steps: [
                'Dye Recipes — master recipe library. Each recipe stores the standard chemical formula (dyes and auxiliaries), washing bath sequence (Bak Cuci), and finishing treatment. Recipes are reusable across multiple dyeing runs.',
                'Dyeing Orders — execution interface for dyeing runs. Select a DYEING work order on the left; create, start, and complete runs on the right. Records job metadata, process parameters, and actual chemical consumption.',
                'Setting Orders — execution interface for heat-setting runs. Select a SETTING work order; record machine speed, temperature, fabric width, GSM, and shrinkage measurements.',
            ],
        },
        {
            heading: 'Lab Dip Requests',
            body: 'Before a colour goes into production it passes through a lab dip — a colour-matching approval gate, found in the Dyeing & Setting group of the sidebar. A Lab Dip Request (code LD-YYYY-#####) is raised against a customer, a base item, and a colour standard (e.g. a Pantone reference), and tracks colour submissions through approval.',
            steps: [
                'Raise a request with one or more colour lines, choosing the request type (New, Resubmit, or Strike-off).',
                'Each colour line is reviewed per submission round and marked Approved, Rejected, or Resubmit; approved lines lock.',
                'The request status moves Draft → Submitted → Approved / Rejected.',
                'On approval, the request ties to the dye recipe that achieves the matched colour — the link from an approved colour to the recipe used in production.',
            ],
            callout: {
                type: 'tip',
                text: 'Lab dips mirror the Sample Request approval pattern but live under Dyeing & Setting. They establish which recipe a colour maps to before any Production Run is planned.',
            },
        },
        {
            heading: 'Yarn Lab Dips',
            body: 'Yarn substrate colours are approved through the same Lab Dip Request workflow, on their own Yarn Lab Dips screen and their own request-numbering series — kept separate from fabric/finished-good lab dips so a yarn approval batch is never gapped by unrelated fabric requests. A Lab Dip Report rolls up submission and approval activity across both fabric and yarn requests.',
        },
        {
            heading: 'Work Order Integration',
            body: 'Assigning a Work Order to a DYEING work centre wires the dyeing workflow automatically: the system finds the active dye recipe whose attribute values match the Manufacturing Order\'s attributes, sets it as the WO\'s planned recipe, and pre-creates a PENDING Dyeing Run with the substrate quantity already filled in. Both steps are hard requirements — the MO must have attributes and a matching active recipe must exist.',
        },
        {
            heading: 'Dye Recipes',
            body: 'A Dye Recipe is the standard formula for achieving a specific colour on a specific substrate. It is master data — not tied to any single job — and can be referenced by many dyeing runs. A recipe carries the attribute values (e.g. Colour) that bind it to matching Manufacturing Orders, and its code is editable.',
            table: {
                headers: ['Field', 'Purpose'],
                rows: [
                    ['Code', 'Unique recipe identifier (e.g. RCP-NAVY-03)'],
                    ['Name / Warna', 'Colour name (e.g. NAVY 03)'],
                    ['Color Standard', 'Color matching reference (e.g. 24905C-3)'],
                    ['Substrate Type', 'Fabric type this recipe is designed for (e.g. Cotton, Polyester)'],
                    ['Is Active', 'Inactive recipes are hidden from run selection dropdowns'],
                ],
            },
        },
        {
            heading: 'Chemical Lines (Dyes & Auxiliaries)',
            body: 'Each recipe has one or more chemical lines. Two quantity modes are supported:',
            table: {
                headers: ['Mode', 'Field', 'When to use'],
                rows: [
                    ['Per-liter', 'g/L (qty_per_liter)', 'Standard for most dyeing — quantity is expressed per liter of bath water. Actual total = g/L × Volume Air (liters).'],
                    ['Per-100kg substrate', 'g/100kg (qty_per_100kg)', 'Legacy mode. Quantity expressed per 100 kg of substrate weight. Actual total = g/100kg × substrate_qty / 100.'],
                ],
            },
            callout: {
                type: 'tip',
                text: 'Use g/L for all new recipes — it matches the physical Kartu Celup format used at the factory. When completing a dyeing run, planned quantities are auto-calculated from g/L × Volume Air entered on the run.',
            },
        },
        {
            heading: 'Chemical Types',
            body: 'Each chemical line is classified by type, which controls how it is grouped on the Kartu Celup printout:',
            table: {
                headers: ['Type', 'Description', 'Print label'],
                rows: [
                    ['DYE', 'The colorant — Levaset, Remazol, etc.', 'Dyes 1, Dyes 2, Dyes 3 …'],
                    ['AUXILIARY', 'Process chemicals — levelling agent, wetting agent, etc.', 'Chem 1, Chem 2 …'],
                    ['SALT', 'Glauber\'s salt, common salt', 'Chem N'],
                    ['OTHER', 'Catch-all for uncategorised materials', 'Chem N'],
                ],
            },
        },
        {
            heading: 'Bak Cuci (Washing Baths)',
            body: 'After the main dyeing process, fabric passes through a series of washing baths. Each bath entry in the recipe records the bath number and treatment description — for example "AIR PANAS SIRKULASI" (hot water circulation) or "ACEFIX MF CONC 30cc/l SEBACID A2 1cc/l". Up to 8 baths are typical. Add baths in the recipe editor using the Bak Cuci section.',
        },
        {
            heading: 'Finishing',
            body: 'The finishing step applies softeners and fixatives after washing — for example "TALASOFT NI 20cc/l CHROMAFIX FRD 10cc/l". Add one or more finishing lines in the Finishing section of the recipe editor. These appear on the printed Kartu Celup below the Bak Cuci sequence.',
        },
        {
            heading: 'Printing a Kartu Celup',
            body: 'Every saved recipe can be printed as a formatted Kartu Celup (dyeing recipe card) that matches the physical document used at the factory. To print:',
            steps: [
                'Select a recipe from the left panel.',
                'Click the Print button in the recipe detail header.',
                'A Kartu Celup preview modal opens showing: company header, job metadata (Warna, Color Matching, Artikel, LOT, Qty Order, Volume Air, Mesin Celup, Tekanan, Speed), the full chemical table (Dyes then Chemicals, with rate and total columns), Bak Cuci sequence, and Finishing.',
                'Click Print in the modal to send to the browser print dialog. Only the card area prints — the navigation, sidebar, and modal controls are hidden via print CSS.',
            ],
            callout: {
                type: 'info',
                text: 'The "Total" column on the Kartu Celup is intentionally left blank on the recipe card itself — it is filled in per run based on the actual Volume Air. When completing a dyeing run, the system calculates totals automatically as g/L × Volume Air.',
            },
        },
        {
            heading: 'Creating a Dyeing Run',
            body: 'A Dyeing Run records a single execution of the dyeing process for a specific work order. One work order can have multiple runs (rework, split batches), each tracked with a sequential run number.',
            steps: [
                'Go to the Dyeing Orders tab and select a DYEING work order from the left panel.',
                'Click + Create Run to open the create form.',
                'Fill in the Job Info section: Customer, No. PO, Artikel, Warna, Color Matching, LOT, and Qty Order (kg). These fields mirror the Kartu Celup header.',
                'Fill in Process parameters: Recipe (select from library), Substrate Qty (kg), Input Batch, Machine Name, Liquor Ratio, Volume Air (L), Speed, Tekanan (Pressure), Temperature (°C), Duration (min), and Operator.',
                'Click Save Run. The run is created with status PENDING.',
            ],
            callout: {
                type: 'tip',
                text: 'Volume Air is the key field for auto-scaling chemicals. Enter it on the run so that when you open the Complete modal, planned chemical quantities are pre-filled as g/L × Volume Air.',
            },
        },
        {
            heading: 'Dyeing Run Lifecycle',
            body: 'Each run moves through three statuses:',
            table: {
                headers: ['Status', 'Meaning', 'Action'],
                rows: [
                    ['PENDING', 'Run created, not yet started', 'Click Start → sets started_at, moves to IN_PROGRESS'],
                    ['IN_PROGRESS', 'Dyeing process underway', 'Click Complete → opens the completion modal'],
                    ['COMPLETED', 'Run finished, chemicals recorded, output batch created', 'Read-only'],
                ],
            },
        },
        {
            heading: 'Completing a Dyeing Run',
            body: 'The completion modal records the final outcome of the run:',
            steps: [
                'Shade Result — select PASS, FAIL, or REWORK.',
                'Output Batch Number — enter the batch number for the finished goods. If the batch does not exist it is auto-created and linked to the Manufacturing Order\'s output item.',
                'Chemicals table — planned quantities are pre-populated from the recipe (g/L × Volume Air) if the run has both recipe_id and volume_air_liters set. Adjust actual quantities to match what was physically used. Add or remove chemical rows as needed.',
                'Shade Notes — optional quality comment.',
                'Click Complete. The run is marked COMPLETED, chemicals are saved with planned vs actual quantities for variance tracking, and the output batch is linked.',
            ],
            callout: {
                type: 'info',
                text: 'Planned vs. actual chemical quantities are stored separately. This enables recipe costing and variance analysis — you can see how much was planned versus how much was actually consumed in each run.',
            },
        },
        {
            heading: 'Creating a Setting Run',
            body: 'A Setting Run records a heat-setting or steaming pass. Setting processes stabilise fabric dimensions and set the final GSM and width after dyeing.',
            steps: [
                'Go to the Setting Orders tab and select a SETTING work order.',
                'Click + Create Run.',
                'Enter: Input Batch, Substrate Qty, Machine Name, Temperature (°C), Speed (m/min), Width (cm), Overfeed (%), and Operator.',
                'Click Save Run. Status is PENDING.',
                'Click Start to begin the run.',
                'Click Complete to record actual measurements: Actual Width (cm), Actual GSM, and Actual Shrinkage (%).',
            ],
        },
        {
            heading: 'Setting Run — Actual Measurements',
            body: 'Completion of a setting run records dimensional and weight outcomes:',
            table: {
                headers: ['Field', 'Unit', 'What it captures'],
                rows: [
                    ['Actual Width', 'cm', 'Final fabric width after setting — typically narrower than input due to shrinkage'],
                    ['Actual GSM', 'g/m²', 'Grams per square metre — fabric weight after setting'],
                    ['Actual Shrinkage', '%', 'Percentage length or width reduction compared to input'],
                ],
            },
        },
        {
            heading: 'Batch Traceability',
            body: 'Both dyeing and setting runs link to input and output batches. On run completion, if the output batch number does not already exist, it is automatically created and associated with the item produced by the parent Manufacturing Order. This creates a traceable chain: raw fibre batch → dyeing run → dyed batch → setting run → finished fabric batch.',
        },
        {
            heading: 'Key Actions',
            items: [
                'Raise lab dip requests and approve colour submissions to tie a matched colour to its dye recipe',
                'Create reusable dye recipes with chemical lines (g/L or g/100kg), Bak Cuci wash baths, and finishing steps',
                'Let a DYEING work order auto-resolve its recipe and pre-create a pending dyeing run from the MO attributes',
                'Print a Kartu Celup (dyeing recipe card) directly from the recipe detail view',
                'Create dyeing runs with full job metadata matching the physical Kartu Celup header',
                'Start and complete dyeing runs with auto-scaled planned chemical quantities from the recipe',
                'Record actual vs. planned chemical consumption for variance tracking',
                'Record shade results (PASS / FAIL / REWORK) on run completion',
                'Create and complete setting runs with speed, temperature, width, GSM, and shrinkage measurements',
                'Auto-create output batches linked to the Manufacturing Order output item',
                'Trace material flow from input batch through dyeing and setting to output batch',
            ],
        },
    ],
};
