"""Which variant an MO is actually producing: combo / size / colour.

One home, because every floor-facing surface has to name the same thing the same
way -- the loom card, the dye vessel card and the WO list must never disagree
about what is on the machine. It was private to `api/weaving.py` until the dyeing
monitor needed it too; a second copy is how two screens start describing one MO
differently.

The labels come from the MO's attribute values keyed by `system_role` (never by
attribute name -- see the system-attribute rule in CLAUDE.md) plus the BOMSize
snapshot, so a renamed attribute cannot blank a card.
"""
from typing import Optional

from app.models.manufacturing import ManufacturingOrder
from app.services import stock_service

EMPTY = {
    "combo_label": None, "size_label": None, "color_label": None,
    "color_code": None, "color_name": None, "color_hex": None,
    "labdip_variant_code": None,
}


def variant_labels(mo: Optional[ManufacturingOrder]) -> dict:
    """The variant chips for one MO. Requires `attribute_values.attribute` eager-loaded.

    `mo.color` rides along on the MO load (lazy="joined"). Callers in async routes
    must have loaded `attribute_values -> attribute`, or SQLAlchemy raises
    MissingGreenlet rather than silently returning blanks.
    """
    if mo is None:
        return dict(EMPTY)

    def by_role(role: str) -> Optional[str]:
        av = next(
            (v for v in (mo.attribute_values or [])
             if v.attribute and v.attribute.system_role == role),
            None,
        )
        return av.value if av else None

    color = mo.color
    return {
        "combo_label": by_role("combo"),
        "size_label": stock_service._bom_size_label(mo.bom_size_snapshot),
        "color_label": by_role("color"),
        "color_code": color.code if color else None,
        "color_name": color.name if color else None,
        "color_hex": color.hex if color else None,
        "labdip_variant_code": mo.labdip_variant_code,
    }
