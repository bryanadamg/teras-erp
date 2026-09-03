"""Production-quantity formula: storage, grammar, validation.

The formula is a plant-wide set of `QtyFormulaRule` rows — one expression per
garment size, plus a `*` fallback. See the model docstring for why it exists.

This module owns the **grammar**. The expression language is deliberately tiny
and has no `eval()` anywhere near it: a hand-written recursive-descent parser
over a fixed token set, so a saved expression can never be arbitrary Python.
`frontend/app/components/shared/qtyFormula.ts` implements the same grammar for
the browser (that is where Apply actually runs); the two must stay in step, so
change them together and keep FUNCTIONS identical.

Grammar:
    expr   := term (('+' | '-') term)*
    term   := unary (('*' | '/') unary)*
    unary  := ('+' | '-') unary | atom
    atom   := NUMBER | NAME | NAME '(' expr (',' expr)* ')' | '(' expr ')'

Names are standard size names ("S", "M", "2XL"…) meaning *the qty ordered for
that size*, plus `qty` meaning *the qty ordered for the size this row computes*
(which is what makes the `*` fallback expressible). A size the BOM does not
carry evaluates to 0, exactly as the hardcoded formula's lookup did.
"""

from __future__ import annotations

import math
import re
import uuid
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.qty_formula import QtyFormulaRule
from app.models.size import Size

# The fallback row's size_name. Applies to any size without its own row, and to
# non-sized BOMs (one total qty, no size rows).
FALLBACK = "*"

# `qty` = the ordered quantity of the size being computed.
SELF_NAME = "qty"

# name -> (min args, max args); max 0 means variadic.
FUNCTIONS: dict[str, tuple[int, int]] = {
    "min": (1, 0),
    "max": (1, 0),
    "round": (1, 1),
    "ceil": (1, 1),
    "floor": (1, 1),
    "abs": (1, 1),
}

_FUNC_IMPL = {
    "min": min,
    "max": max,
    "round": lambda x: float(round(x)),
    "ceil": lambda x: float(math.ceil(x)),
    "floor": lambda x: float(math.floor(x)),
    "abs": abs,
}

# The hardcoded rule this feature replaced, verbatim:
#   S = 0 | M = (S+M)/2 | L = (S+M)/2 + L | anything else = as ordered
DEFAULT_RULES: list[tuple[str, str]] = [
    ("S", "0"),
    ("M", "(S + M) / 2"),
    ("L", "(S + M) / 2 + L"),
    (FALLBACK, SELF_NAME),
]


class FormulaError(ValueError):
    """A malformed expression. The message is shown to the user as-is."""


# -- Tokenizer ---------------------------------------------------------------

_TOKEN_RE = re.compile(
    r"""
    \s*(?:
        # Names come first: sizes like "2XL" start with a digit, so trying the
        # number rule first would split them into 2 and XL.
        (?P<name>[A-Za-z_][A-Za-z0-9_]*|\d+[A-Za-z_][A-Za-z0-9_]*)
      | (?P<number>\d+(?:\.\d+)?)
      | (?P<op>[-+*/(),])
      | (?P<bad>\S)
    )
    """,
    re.VERBOSE,
)


def _tokenize(src: str) -> list[tuple[str, str]]:
    tokens: list[tuple[str, str]] = []
    pos = 0
    while pos < len(src):
        m = _TOKEN_RE.match(src, pos)
        if not m or m.end() == pos:
            break
        pos = m.end()
        if m.lastgroup == "bad":
            raise FormulaError(f"Unexpected character '{m.group('bad')}'")
        if m.lastgroup is None:
            break
        tokens.append((m.lastgroup, m.group(m.lastgroup)))
    return tokens


# -- Parser / evaluator (one pass, values only) ------------------------------

class _Parser:
    def __init__(self, tokens: list[tuple[str, str]], names: dict[str, float], strict: bool = True):
        self.tokens = tokens
        self.i = 0
        self.names = names
        # strict=True (validation) rejects a name nobody could ever supply.
        # strict=False (evaluation) reads an absent name as 0, because a BOM
        # that simply has no 3XL row must not break a formula mentioning it —
        # the hardcoded version's size lookup returned 0 the same way.
        self.strict = strict

    def peek(self) -> tuple[str, str] | None:
        return self.tokens[self.i] if self.i < len(self.tokens) else None

    def take(self) -> tuple[str, str]:
        tok = self.peek()
        if tok is None:
            raise FormulaError("Expression ends too early")
        self.i += 1
        return tok

    def eat_op(self, op: str) -> bool:
        tok = self.peek()
        if tok and tok[0] == "op" and tok[1] == op:
            self.i += 1
            return True
        return False

    def expect_op(self, op: str) -> None:
        if not self.eat_op(op):
            tok = self.peek()
            got = tok[1] if tok else "end of expression"
            raise FormulaError(f"Expected '{op}' but found {got}")

    def parse(self) -> float:
        if not self.tokens:
            raise FormulaError("Expression is empty")
        value = self.expr()
        rest = self.peek()
        if rest is not None:
            raise FormulaError(f"Unexpected '{rest[1]}' after the end of the expression")
        return value

    def expr(self) -> float:
        value = self.term()
        while True:
            if self.eat_op("+"):
                value += self.term()
            elif self.eat_op("-"):
                value -= self.term()
            else:
                return value

    def term(self) -> float:
        value = self.unary()
        while True:
            if self.eat_op("*"):
                value *= self.unary()
            elif self.eat_op("/"):
                divisor = self.unary()
                # A zero divisor is a formula the user can write but not mean.
                # Refuse it at save time rather than minting NaN quantities.
                if divisor == 0:
                    raise FormulaError("Division by zero")
                value /= divisor
            else:
                return value

    def unary(self) -> float:
        if self.eat_op("-"):
            return -self.unary()
        if self.eat_op("+"):
            return self.unary()
        return self.atom()

    def atom(self) -> float:
        kind, text = self.take()
        if kind == "number":
            return float(text)
        if kind == "name":
            if self.eat_op("("):
                args = [self.expr()]
                while self.eat_op(","):
                    args.append(self.expr())
                self.expect_op(")")
                return self.call(text, args)
            key = text if text == SELF_NAME else text.upper()
            if key not in self.names:
                if self.strict:
                    raise FormulaError(f"Unknown name '{text}'")
                return 0.0
            return self.names[key]
        if kind == "op" and text == "(":
            value = self.expr()
            self.expect_op(")")
            return value
        raise FormulaError(f"Unexpected '{text}'")

    def call(self, name: str, args: list[float]) -> float:
        spec = FUNCTIONS.get(name.lower())
        if not spec:
            raise FormulaError(f"Unknown function '{name}'")
        lo, hi = spec
        if len(args) < lo or (hi and len(args) > hi):
            want = str(lo) if hi == lo else (f"at least {lo}" if not hi else f"{lo}-{hi}")
            raise FormulaError(f"'{name}' takes {want} argument(s), got {len(args)}")
        return float(_FUNC_IMPL[name.lower()](*args))


def evaluate(expression: str, values: dict[str, float]) -> float:
    """Evaluate one expression. `values` is keyed by upper-cased size name plus
    `qty`; a name the grammar knows but this dict omits counts as 0."""
    names = {SELF_NAME: 0.0}
    names.update(values)
    return _Parser(_tokenize(expression), names, strict=False).parse()


def validate_expression(expression: str, size_names: Iterable[str]) -> None:
    """Raise FormulaError if the expression is not a valid formula.

    Validation *is* evaluation with every size set to 1 — a parser that can
    produce a number for arbitrary inputs is a parser that accepted the text,
    and it catches division by zero and arity mistakes in the same pass.
    """
    probe = {n.upper(): 1.0 for n in size_names}
    probe[SELF_NAME] = 1.0
    _Parser(_tokenize(expression), probe).parse()


# -- Storage -----------------------------------------------------------------

async def size_names(db: AsyncSession) -> list[str]:
    rows = await db.execute(select(Size).order_by(Size.sort_order, Size.name))
    return [s.name for s in rows.scalars().all()]


async def get_rules(db: AsyncSession) -> list[QtyFormulaRule]:
    """The stored formula, seeding the defaults on first read so a fresh DB (or
    one migrated before the seed ran) never hands the modal an empty rule set."""
    rows = await db.execute(select(QtyFormulaRule))
    rules = list(rows.scalars().all())
    if not rules:
        for name, expr in DEFAULT_RULES:
            db.add(QtyFormulaRule(size_name=name, expression=expr))
        await db.commit()
        rows = await db.execute(select(QtyFormulaRule))
        rules = list(rows.scalars().all())
    return sort_rules(rules, await size_names(db))


def sort_rules(rules: list[QtyFormulaRule], names: list[str]) -> list[QtyFormulaRule]:
    """Seeded size order, then any size the seed doesn't know, fallback last."""
    def key(rule: QtyFormulaRule) -> tuple[int, int, str]:
        if rule.size_name == FALLBACK:
            return (2, 0, "")
        if rule.size_name in names:
            return (0, names.index(rule.size_name), rule.size_name)
        return (1, 0, rule.size_name)

    return sorted(rules, key=key)


async def replace_rules(
    db: AsyncSession,
    rules: list[tuple[str, str]],
    user_id: uuid.UUID | None,
) -> list[QtyFormulaRule]:
    """Full replace of the rule set (the caller validates first)."""
    existing = await db.execute(select(QtyFormulaRule))
    for row in existing.scalars().all():
        await db.delete(row)
    await db.flush()
    for name, expr in rules:
        db.add(QtyFormulaRule(size_name=name, expression=expr, updated_by_id=user_id))
    await db.commit()
    # Rows were bulk-deleted and recreated: drop the identity map first or the
    # reload hands back the stale instances (expire_on_commit=False).
    db.expire_all()
    return await get_rules(db)
