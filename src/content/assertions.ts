import type { AssertResult, ExecResponse } from '../shared/types';

interface AssertionCtx {
  status: number;
  body: unknown;
  duration: number;
  header: Record<string, string>;
}

function resolveCtx(ctx: AssertionCtx, rawPath: string): unknown {
  const path = rawPath.trim();

  // "header <name>" — header lookup with space separator
  if (/^header\s+/i.test(path)) {
    const key = path.slice(7).trim().toLowerCase();
    const hdrs = ctx.header ?? {};
    return hdrs[key] ?? hdrs[Object.keys(hdrs).find(k => k.toLowerCase() === key) as string];
  }

  const parts = path.split('.');
  let val: unknown = ctx;
  for (const raw of parts) {
    if (val == null) return undefined;
    const arr = raw.match(/^(.+?)\[(\d+)\]$/);
    if (arr) {
      val = ((val as Record<string, unknown>)[arr[1]] as Record<string, unknown> | undefined)?.[+arr[2]];
    } else {
      val = (val as Record<string, unknown>)[raw];
    }
  }
  return val;
}

function parseRhs(s: string): unknown {
  const t = s.trim();
  if (t === 'null') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'undefined') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^["'].*["']$/.test(t)) return t.slice(1, -1);
  return t;
}

function evalOne(expr: string, ctx: AssertionCtx): AssertResult {
  const e = expr.trim();

  // Unary / type checks (no right-hand side)
  const unaryMatch = e.match(/^(.+?)\s+(exists|isTrue|isFalse|isNumber|isBoolean|isString|isArray)$/i);
  if (unaryMatch) {
    const val = resolveCtx(ctx, unaryMatch[1]);
    switch (unaryMatch[2].toLowerCase()) {
      case 'exists':    return { expr: e, pass: val != null, actual: val };
      case 'istrue':    return { expr: e, pass: val === true, actual: val };
      case 'isfalse':   return { expr: e, pass: val === false, actual: val };
      case 'isnumber':  return { expr: e, pass: typeof val === 'number', actual: typeof val };
      case 'isboolean': return { expr: e, pass: typeof val === 'boolean', actual: typeof val };
      case 'isstring':  return { expr: e, pass: typeof val === 'string', actual: typeof val };
      case 'isarray':   return { expr: e, pass: Array.isArray(val), actual: typeof val };
    }
  }

  // Binary operators — longest first to avoid prefix collisions
  const OPS = ['startsWith', 'endsWith', 'includes', 'contains', 'matches', '!=', '==', '<=', '>=', '<', '>'];
  for (const op of OPS) {
    const sep = ['<', '>', '==', '!=', '<=', '>='].includes(op) ? ` ${op} ` : ` ${op} `;
    const idx = e.indexOf(sep);
    if (idx === -1) continue;

    const lhs = e.slice(0, idx).trim();
    const rhs = e.slice(idx + sep.length);
    const actual = resolveCtx(ctx, lhs);
    const expected = parseRhs(rhs);
    let pass: boolean;

    switch (op) {
      case '==':         pass = actual == expected; break;
      case '!=':         pass = actual != expected; break;
      case '<':          pass = Number(actual) < Number(expected); break;
      case '>':          pass = Number(actual) > Number(expected); break;
      case '<=':         pass = Number(actual) <= Number(expected); break;
      case '>=':         pass = Number(actual) >= Number(expected); break;
      case 'includes':
      case 'contains':
        pass = Array.isArray(actual)
          ? (actual as unknown[]).includes(expected)
          : String(actual ?? '').includes(String(expected));
        break;
      case 'startsWith': pass = String(actual ?? '').startsWith(String(expected as string)); break;
      case 'endsWith':   pass = String(actual ?? '').endsWith(String(expected as string)); break;
      case 'matches':    try { pass = new RegExp(expected as string).test(String(actual ?? '')); } catch { pass = false; } break;
      default: pass = false;
    }
    return { expr: e, pass, actual, expected, op };
  }

  // Bare path — truthy check
  const val = resolveCtx(ctx, e);
  return { expr: e, pass: !!val, actual: val, expected: 'truthy' };
}

export function evaluateAssertions(assertions: string[], res: ExecResponse): AssertResult[] {
  if (!assertions?.length) return [];

  let parsed: unknown;
  try { parsed = JSON.parse(res.body); } catch { parsed = res.body ?? ''; }

  const ctx: AssertionCtx = {
    status: res.status,
    body: parsed,
    duration: res.time,
    header: res.headers ?? {},
  };

  return assertions.map(expr => {
    try {
      return evalOne(expr, ctx);
    } catch (e) {
      return { expr, pass: false, actual: null, expected: null, error: (e as Error).message };
    }
  });
}
