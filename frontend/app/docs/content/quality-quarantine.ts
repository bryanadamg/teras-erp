import { DocPage } from '../docsContent';

export const qualityQuarantinePage: DocPage = {
    slug: 'quality-quarantine',
    title: 'Quality & Quarantine',
    subtitle: 'Grade rejected material, route it to a defect store, and hold lots until they are released for packing.',
    badges: ['Quality Grades', 'Reject Locations', 'Quarantine', 'Quarantine Packing'],
    sections: [
        {
            heading: 'Quality Grades',
            body: 'Every lot carries a quality grade, not just a pass/fail flag. A rejection can be a full write-off, or a deliberate downgrade that keeps the material usable elsewhere — the system tracks the difference so a downgraded lot does not silently disappear from what operators can pick.',
            table: {
                headers: ['Grade', 'Meaning', 'Counted in MRP netting?', 'Selectable in pickers?'],
                rows: [
                    ['Good', 'Normal, unrestricted stock', 'Yes', 'Yes'],
                    ['Reject (usable)', 'Downgraded but still fit for another use — e.g. a rejected warp beam re-mounted for a different item', 'No', 'Yes, with a warning'],
                    ['Reject', 'Scrap-bound; excluded everywhere', 'No', 'No'],
                    ['Disposed', 'Written off — no stock remains', 'No', 'No'],
                ],
            },
            callout: {
                type: 'info',
                text: 'Rejecting a lot always asks whether it is still usable. Answering yes grades it "Reject (usable)" instead of a full reject — the only difference between the two is whether pickers may still select it.',
            },
        },
        {
            heading: 'Where Rejected Stock Goes',
            body: 'A rejected lot is transferred out of the good stock location into a defect store — it never just sits flagged in place. The destination is resolved automatically, in order:',
            steps: [
                'An explicit location chosen at the moment of rejection, if one was picked.',
                'The producing work centre\'s Reject Location — set on a work-centre TYPE or GROUP and inherited by every MACHINE underneath it (e.g. the whole Weaving type routes to "Gd Greige BS", the whole Beaming type routes to "Gd WiP Beam Reject").',
                'The item master\'s Default Reject Location, as a final fallback when the work centre has none configured.',
            ],
        },
        {
            heading: 'Quarantine Locations',
            body: 'Separately from grading, a Location can be flagged as a quarantine hold area (e.g. an incoming QC bay). The flag is inherited downward — every bin underneath a flagged warehouse counts as quarantined too, so a plant only has to flag the top-level store once.',
        },
        {
            heading: 'Quarantine Status & Release',
            body: 'A lot sitting in a quarantine location carries its own Quarantine Status — an attribute value such as "Waiting Approval", "Bulk Sample", or "OK" — set and changed from the Quarantine Packing screen. Only lots whose status is "OK" are released; every other status, including new ones a plant adds later, continues to hold.',
            callout: {
                type: 'warning',
                text: 'Packing is blocked at the source: a lot sitting in a quarantine location whose status is not "OK" cannot be pulled into a packing order, no matter how much good-looking stock it shows on paper.',
            },
        },
        {
            heading: 'Quarantine Packing Screen',
            body: 'Quarantine Packing is the QC hold desk that sits immediately before Packing Orders in the Sales workflow. It lists lots sitting in quarantine locations, lets a quality reviewer inspect and change each lot\'s Quarantine Status, and is the only place that status can move to "OK" and clear a lot for packing.',
        },
        {
            heading: 'Reject Reporting',
            body: 'Every reject event — quantity, reason, who rejected it, and the defect store it landed in — is kept and shown on the Production Output report (Reports & Dashboard), broken down per machine, per work order, and per packing order, alongside a reject-percentage figure. See Reports & Dashboard for the full report layout.',
        },
        {
            heading: 'Key Actions',
            items: [
                'Reject a lot as scrap-bound, or downgrade it to "usable" so it still shows up (with a warning) in consumption and staging pickers',
                'Rely on the work-centre reject-location hierarchy so operators never have to pick a defect-store bin by hand',
                'Flag a warehouse or bay as a quarantine hold area, inherited by every bin underneath it',
                'Review lots on the Quarantine Packing desk and clear their Quarantine Status to "OK" before they can be packed',
                'Read reject quantity, reason, and destination per machine, work order, or packing order on the Production Output report',
            ],
        },
    ],
};
