/**
 * Production quantity formula — the browser half.
 *
 * Turns the sizes a sales order asked for into the sizes to actually make.
 * This used to be a hardcoded switch inside ProductionRunModal (S=0,
 * M=(S+M)/2, L=(S+M)/2+L, everything else as ordered); it is now a per-size
 * expression the client edits in Settings, stored in `qty_formula_rules` and
 * served by GET /settings/qty-formula.
 *
 * The grammar mirrors `backend/app/services/qty_formula_service.py` exactly —
 * that module validates on save, this one evaluates on Apply. Change both
 * together. No `eval()`, no `Function()`: a hand-written recursive-descent
 * parser over a fixed token set, so a stored expression can never become code.
 *
 * Names are standard size names ("S", "M", "2XL"…) meaning the qty ordered for
 * that size, plus `qty` meaning the qty ordered for the size being computed —
 * which is what makes the `*` fallback row expressible. A size the BOM does
 * not carry reads as 0, exactly as the hardcoded lookup did.
 *
 * The tolerance % is NOT part of an expression: the result is multiplied by
 * (1 + tol/100) and rounded up afterwards, so one formula serves every
 * tolerance the planner types.
 */

export type QtyFormulaRule = { size_name: string; expression: string };

/** The fallback row: used by any size without its own rule, and by non-sized BOMs. */
export const QTY_FORMULA_FALLBACK = '*';

/** The ordered qty of the size being computed. */
export const QTY_FORMULA_SELF = 'qty';

/** name -> [min args, max args]; max 0 means variadic. Keep in step with the backend. */
export const QTY_FORMULA_FUNCTIONS: Record<string, [number, number]> = {
    min: [1, 0],
    max: [1, 0],
    round: [1, 1],
    ceil: [1, 1],
    floor: [1, 1],
    abs: [1, 1],
};

const FUNC_IMPL: Record<string, (...args: number[]) => number> = {
    min: (...a) => Math.min(...a),
    max: (...a) => Math.max(...a),
    round: a => Math.round(a),
    ceil: a => Math.ceil(a),
    floor: a => Math.floor(a),
    abs: a => Math.abs(a),
};

/** The rule that was hardcoded before this feature. Also what the API seeds. */
export const DEFAULT_QTY_FORMULA: QtyFormulaRule[] = [
    { size_name: 'S', expression: '0' },
    { size_name: 'M', expression: '(S + M) / 2' },
    { size_name: 'L', expression: '(S + M) / 2 + L' },
    { size_name: QTY_FORMULA_FALLBACK, expression: QTY_FORMULA_SELF },
];

// ── Tokenizer ───────────────────────────────────────────────────────────────

type Token = { kind: 'name' | 'number' | 'op'; text: string };

// Names first: sizes like "2XL" start with a digit, so matching numbers first
// would split them into 2 and XL.
const TOKEN_RE = /\s*(?:([A-Za-z_][A-Za-z0-9_]*|\d+[A-Za-z_][A-Za-z0-9_]*)|(\d+(?:\.\d+)?)|([-+*/(),])|(\S))/y;

function tokenize(src: string): Token[] {
    const tokens: Token[] = [];
    TOKEN_RE.lastIndex = 0;
    while (TOKEN_RE.lastIndex < src.length) {
        const start = TOKEN_RE.lastIndex;
        const m = TOKEN_RE.exec(src);
        if (!m || TOKEN_RE.lastIndex === start) break;
        if (m[4] !== undefined) throw new Error(`Unexpected character '${m[4]}'`);
        if (m[1] !== undefined) tokens.push({ kind: 'name', text: m[1] });
        else if (m[2] !== undefined) tokens.push({ kind: 'number', text: m[2] });
        else if (m[3] !== undefined) tokens.push({ kind: 'op', text: m[3] });
        else break;
    }
    return tokens;
}

// ── Parser / evaluator ──────────────────────────────────────────────────────

class Parser {
    private i = 0;

    // strict=true (validation) rejects a name nobody could ever supply.
    // strict=false (evaluation) reads an absent name as 0, so a BOM with no
    // 3XL row doesn't break a formula that mentions 3XL.
    constructor(
        private tokens: Token[],
        private names: Record<string, number>,
        private strict: boolean,
    ) {}

    private peek(): Token | null { return this.i < this.tokens.length ? this.tokens[this.i] : null; }

    private take(): Token {
        const tok = this.peek();
        if (!tok) throw new Error('Expression ends too early');
        this.i += 1;
        return tok;
    }

    private eatOp(op: string): boolean {
        const tok = this.peek();
        if (tok && tok.kind === 'op' && tok.text === op) { this.i += 1; return true; }
        return false;
    }

    private expectOp(op: string): void {
        if (!this.eatOp(op)) {
            const tok = this.peek();
            throw new Error(`Expected '${op}' but found ${tok ? tok.text : 'end of expression'}`);
        }
    }

    parse(): number {
        if (this.tokens.length === 0) throw new Error('Expression is empty');
        const value = this.expr();
        const rest = this.peek();
        if (rest) throw new Error(`Unexpected '${rest.text}' after the end of the expression`);
        return value;
    }

    private expr(): number {
        let value = this.term();
        for (;;) {
            if (this.eatOp('+')) value += this.term();
            else if (this.eatOp('-')) value -= this.term();
            else return value;
        }
    }

    private term(): number {
        let value = this.unary();
        for (;;) {
            if (this.eatOp('*')) value *= this.unary();
            else if (this.eatOp('/')) {
                const divisor = this.unary();
                // A zero divisor is a formula the user can write but not mean;
                // refuse it rather than minting NaN quantities.
                if (divisor === 0) throw new Error('Division by zero');
                value /= divisor;
            } else return value;
        }
    }

    private unary(): number {
        if (this.eatOp('-')) return -this.unary();
        if (this.eatOp('+')) return this.unary();
        return this.atom();
    }

    private atom(): number {
        const tok = this.take();
        if (tok.kind === 'number') return parseFloat(tok.text);
        if (tok.kind === 'name') {
            if (this.eatOp('(')) {
                const args = [this.expr()];
                while (this.eatOp(',')) args.push(this.expr());
                this.expectOp(')');
                return this.call(tok.text, args);
            }
            const key = tok.text === QTY_FORMULA_SELF ? tok.text : tok.text.toUpperCase();
            if (!(key in this.names)) {
                if (this.strict) throw new Error(`Unknown name '${tok.text}'`);
                return 0;
            }
            return this.names[key];
        }
        if (tok.kind === 'op' && tok.text === '(') {
            const value = this.expr();
            this.expectOp(')');
            return value;
        }
        throw new Error(`Unexpected '${tok.text}'`);
    }

    private call(name: string, args: number[]): number {
        const spec = QTY_FORMULA_FUNCTIONS[name.toLowerCase()];
        if (!spec) throw new Error(`Unknown function '${name}'`);
        const [lo, hi] = spec;
        if (args.length < lo || (hi && args.length > hi)) {
            const want = hi === lo ? String(lo) : (hi ? `${lo}-${hi}` : `at least ${lo}`);
            throw new Error(`'${name}' takes ${want} argument(s), got ${args.length}`);
        }
        return FUNC_IMPL[name.toLowerCase()](...args);
    }
}

/** Evaluate one expression. `values` is keyed by UPPER-CASED size name plus `qty`. */
export function evaluateExpression(expression: string, values: Record<string, number>): number {
    return new Parser(tokenize(expression), { [QTY_FORMULA_SELF]: 0, ...values }, false).parse();
}

/** Returns an error message, or null when the expression is valid. */
export function validateExpression(expression: string, sizeNames: string[]): string | null {
    const probe: Record<string, number> = { [QTY_FORMULA_SELF]: 1 };
    for (const n of sizeNames) probe[n.toUpperCase()] = 1;
    try {
        new Parser(tokenize(expression), probe, true).parse();
        return null;
    } catch (e: any) {
        return e?.message || 'Invalid expression';
    }
}

// ── Applying the formula ────────────────────────────────────────────────────

function ruleFor(rules: QtyFormulaRule[], sizeName: string): string {
    const own = rules.find(r => r.size_name.toUpperCase() === sizeName.toUpperCase());
    if (own) return own.expression;
    const fallback = rules.find(r => r.size_name === QTY_FORMULA_FALLBACK);
    return fallback ? fallback.expression : QTY_FORMULA_SELF;
}

/** A BOMSize row the formula computes: a standard Size, not a free-mode label. */
function isStandard(bomSize: any): boolean {
    return !!bomSize?.size_id && !bomSize?.label;
}

/** The standard Size name of a BOMSize row, upper-cased. */
function standardName(bomSize: any): string {
    return String(bomSize?.size_name || bomSize?.size?.name || '').trim().toUpperCase();
}

/**
 * Ordered qty per BOMSize -> qty to make per BOMSize, as input strings.
 *
 * `rawQtys` is keyed by BOMSize id and holds the *untouched* ordered figures,
 * so pressing Apply twice at 5% is not 10% — the formula always re-derives
 * from the order, never from what is currently in the boxes.
 *
 * Free-mode rows (a label, no Size) pass through untouched: they have no name
 * for a rule to be written against.
 */
export function applyQtyFormula(
    sizes: any[],
    rawQtys: Record<string, number>,
    tolerancePct: number,
    rules: QtyFormulaRule[],
): Record<string, string> {
    const factor = 1 + tolerancePct / 100;
    const active = rules.length ? rules : DEFAULT_QTY_FORMULA;

    const ordered: Record<string, number> = {};
    for (const s of sizes) {
        if (!isStandard(s)) continue;
        ordered[standardName(s)] = rawQtys[s.id] ?? 0;
    }

    const result: Record<string, string> = {};
    for (const s of sizes) {
        if (!isStandard(s)) {
            const raw = rawQtys[s.id];
            result[s.id] = raw != null ? String(raw) : '';
            continue;
        }
        const own = rawQtys[s.id] ?? 0;
        let qty: number;
        try {
            qty = evaluateExpression(ruleFor(active, standardName(s)), { ...ordered, [QTY_FORMULA_SELF]: own });
        } catch {
            // The API validates on save, so this only fires on a hand-edited or
            // partially-migrated row. Fall back to the ordered qty rather than
            // silently zeroing a size out of the run.
            qty = own;
        }
        qty *= factor;
        result[s.id] = qty > 0 ? String(Math.ceil(qty)) : '';
    }
    return result;
}

/**
 * The non-sized case: one total qty, no size rows, so the `*` fallback is the
 * only rule that can apply and `qty` is the ordered total.
 */
export function applyQtyFormulaTotal(
    rawTotal: number,
    tolerancePct: number,
    rules: QtyFormulaRule[],
): number {
    const active = rules.length ? rules : DEFAULT_QTY_FORMULA;
    let qty: number;
    try {
        qty = evaluateExpression(ruleFor(active, QTY_FORMULA_FALLBACK), { [QTY_FORMULA_SELF]: rawTotal });
    } catch {
        qty = rawTotal;
    }
    return Math.ceil(qty * (1 + tolerancePct / 100));
}

/** One-line description of the active formula, for the modal's hint text. */
export function formulaSummary(rules: QtyFormulaRule[]): string {
    const active = rules.length ? rules : DEFAULT_QTY_FORMULA;
    return active
        .map(r => `${r.size_name === QTY_FORMULA_FALLBACK ? 'other' : r.size_name}=${r.expression.replace(/\s+/g, '')}`)
        .join(' | ');
}
