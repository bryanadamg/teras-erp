"""Atomic document numbering.

Every code minted by counting rows (`count(*) + 1`) and probing for a free suffix
is a check-then-insert race: two concurrent creates read the same count, build the
same code, and one of them loses. On a unique column that means a 500 that takes
the whole transaction with it — a Production Run losing its entire MO tree; on a
non-unique one (work order codes) it means silent duplicates on the shop floor.

`allocate()` replaces that with the pattern ERPs use for document series (SAP
number ranges, Odoo `no_gap` sequences): a counter row per series, incremented by
the allocating statement itself. Postgres holds the row lock until commit, so
concurrent allocators on the same series queue for microseconds instead of
colliding, and a rolled-back transaction hands its number back automatically.

Callers own the series key and the code format. Legacy rows are handled by
`seed`: it is consulted only when a series has no counter row yet, so existing
installs continue from the highest number already in use instead of restarting
at 1 and colliding with every historical code.
"""
from typing import Awaitable, Callable, Optional, Union

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

Seed = Union[int, Callable[[], Awaitable[int]], None]


async def _resolve_seed(seed: Seed) -> int:
    if seed is None:
        return 0
    if callable(seed):
        return int(await seed() or 0)
    return int(seed)


async def allocate(db: AsyncSession, range_key: str, seed: Seed = None) -> int:
    """Reserve and return the next number in `range_key`'s series.

    `seed` is the highest number already used by pre-existing rows, as an int or an
    async callable. It is evaluated lazily — only on the first allocation for a
    series — so the scan it usually implies does not run on the hot path.
    """
    row = (await db.execute(
        text(
            'UPDATE number_ranges SET next_value = next_value + 1, updated_at = now() '
            'WHERE range_key = :key RETURNING next_value - 1'
        ),
        {"key": range_key},
    )).first()
    if row is not None:
        return int(row[0])

    start = await _resolve_seed(seed) + 1
    # ON CONFLICT covers the race between two first-ever allocations for the same
    # series: the loser blocks on the unique index, then takes the DO UPDATE branch
    # and gets the next number instead of failing.
    row = (await db.execute(
        text(
            'INSERT INTO number_ranges (id, range_key, next_value, updated_at) '
            'VALUES (gen_random_uuid(), :key, :next_value, now()) '
            'ON CONFLICT (range_key) DO UPDATE '
            'SET next_value = number_ranges.next_value + 1, updated_at = now() '
            'RETURNING next_value - 1'
        ),
        {"key": range_key, "next_value": start + 1},
    )).first()
    return int(row[0])


async def allocate_code(
    db: AsyncSession,
    range_key: str,
    formatter: Callable[[int], str],
    seed: Seed = None,
    exists: Optional[Callable[[str], Awaitable[bool]]] = None,
    max_attempts: int = 50,
) -> tuple[int, str]:
    """Allocate numbers off `range_key` until `formatter(n)` is a code `exists`
    reports as free; return `(number, code)`.

    The number comes back alongside the code because callers store it too — a work
    order's routing sequence, for one — and re-parsing it out of the formatted code
    would couple them to the format.

    The `exists` probe is not the concurrency guard — `allocate()` is. It only
    covers codes that were never issued through a range: hand-typed numbers,
    imported data, or a series whose seed scan could not see an oddly-shaped
    legacy code. Without a probe this is a single UPDATE.
    """
    for _ in range(max_attempts):
        number = await allocate(db, range_key, seed)
        code = formatter(number)
        if exists is None or not await exists(code):
            return number, code
    raise RuntimeError(f"Could not allocate a free code for series '{range_key}' in {max_attempts} attempts")
