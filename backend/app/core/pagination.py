"""One page-window contract for every paginated list endpoint.

Two conventions grew up side by side here: `skip`/`limit` (0-based offset) on the
older core domains — items, MOs, PRs, audit logs, stock ledger, sales orders,
BOMs, work orders — and `page`/`size` (1-based) on everything added since:
colors, combos, pick lists, shipments, quarantine, work queue. `batches.py`,
`packing.py` and `stock.py` each ship BOTH on different routes in the same file.

**`page`/`size` is canonical.** The frontend `Pager` is 1-indexed, so `page`/`size`
keeps the `(page - 1) * size` arithmetic in exactly one place (here) instead of
re-deriving it at every call site on both sides of the wire — that arithmetic was
duplicated 19 times and is the classic off-by-one source. `skip`/`limit` stays
accepted as a legacy alias so no existing caller breaks; do not remove it without
migrating the callers first.

Usage:

    @router.get("/things", response_model=PaginatedThingResponse)
    async def list_things(
        window: PageWindow = Depends(PageParams()),
        db: AsyncSession = Depends(get_async_db),
    ):
        q, count_q = select(Thing), select(func.count(Thing.id))
        ...filters applied to both...
        total = (await db.execute(count_q)).scalar_one()
        rows = (await db.execute(window.apply(q.order_by(Thing.code)))).scalars().all()
        return window.envelope(rows, total)
"""

from dataclasses import dataclass, replace
from typing import Any, Optional

from fastapi import Query


@dataclass(frozen=True)
class PageWindow:
    """A resolved page window, normalized from whichever convention the caller used."""

    page: int
    size: int
    offset: int
    #: None means "no cap" — the whole filtered result set (export/print callers).
    limit: Optional[int]

    @property
    def uncapped(self) -> bool:
        return self.limit is None

    def apply(self, query):
        """Attach OFFSET/LIMIT to a SQLAlchemy select. No LIMIT when uncapped."""
        query = query.offset(self.offset)
        if self.limit is not None:
            query = query.limit(self.limit)
        return query

    def at_offset(self, offset: int) -> "PageWindow":
        """Same size, repositioned onto the page that contains row `offset`.

        For deep links that must land on whatever page currently holds a given row
        (samples' `?focus_id=`, which ranks the row under the active filters) — the
        offset is snapped down to a page boundary so the window stays aligned.
        Uncapped windows already hold every row, so they are returned unchanged.
        """
        if self.limit is None or self.size <= 0:
            return self
        snapped = max(0, offset) // self.size * self.size
        return replace(self, offset=snapped, page=snapped // self.size + 1)

    def envelope(self, items: Any, total: int, **extra: Any) -> dict:
        """The `{items, total, page, size}` response shape every list endpoint returns.

        `extra` carries per-domain additions (e.g. sales orders' `status_counts`);
        remember they must also be declared on the response_model or FastAPI drops
        them silently — see the response_model note in CLAUDE.md.
        """
        return {"items": items, "total": total, "page": self.page, "size": self.size, **extra}


class PageParams:
    """FastAPI dependency resolving `page`/`size` (canonical) or `skip`/`limit` (legacy).

    Per-endpoint defaults are constructor args, because the existing endpoints do
    not agree on one (50, 100, 200 and 1000 are all in use) and retrofitting must
    not quietly change any endpoint's page size:

        window: PageWindow = Depends(PageParams(default_size=100))

    `size=0` / `limit=0` requests the uncapped set. Pass `allow_uncapped=False` on
    endpoints whose payload is too heavy to ever serve whole.
    """

    def __init__(self, default_size: int = 50, max_size: int = 500, allow_uncapped: bool = True):
        self.default_size = default_size
        self.max_size = max_size
        self.allow_uncapped = allow_uncapped

    def __call__(
        self,
        page: Optional[int] = Query(None, ge=1, description="1-based page number (canonical)"),
        size: Optional[int] = Query(None, ge=0, description="Rows per page; 0 = uncapped"),
        skip: Optional[int] = Query(None, ge=0, description="Legacy alias for (page-1)*size"),
        limit: Optional[int] = Query(None, ge=0, description="Legacy alias for size; 0 = uncapped"),
    ) -> PageWindow:
        # size wins over limit: a caller sending both is mid-migration to the
        # canonical names, so honour the canonical one.
        raw_size = size if size is not None else limit
        uncapped = raw_size == 0 and self.allow_uncapped

        if raw_size is None or raw_size == 0:
            eff_size = self.default_size
        else:
            eff_size = min(raw_size, self.max_size)

        # page wins over skip, for the same reason.
        if page is not None:
            eff_page, eff_offset = page, (page - 1) * eff_size
        elif skip is not None:
            eff_offset = skip
            eff_page = skip // eff_size + 1
        else:
            eff_page, eff_offset = 1, 0

        if uncapped:
            # An uncapped read is the whole set, so it is page 1 by definition —
            # a leftover skip/page from the paged view must not slice it.
            return PageWindow(page=1, size=eff_size, offset=0, limit=None)

        return PageWindow(page=eff_page, size=eff_size, offset=eff_offset, limit=eff_size)
