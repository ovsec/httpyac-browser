/**
 * Safe expression evaluator for {{= expr }} templates.
 * Replaces the Function() constructor with a recursive-descent parser
 * that ONLY supports literals and operators — no function calls, no globals.
 *
 * Supported:
 *   Numbers: 42, 3.14, -1
 *   Strings: 'hello', "world"
 *   Booleans: true, false
 *   null, undefined
 *   Arithmetic: + - * / %
 *   Comparison: == != < > <= >=
 *   Ternary: a ? b : c
 *   Grouping: (expr)
 *
 * NOT supported (safe from XSS / prototype pollution):
 *   Function calls, property access, identifiers, globals
 */

type Token =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'null' }
  | { type: 'undefined' }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'q' } // ternary '?'
  | { type: 'colon' } // ternary ':'
  | { type: 'eof' };

class Tokenizer {
  private pos = 0;
  constructor(private src: string) {}

  private peek(): string {
    return this.src[this.pos] ?? '\0';
  }

  private advance(): string {
    return this.src[this.pos++] ?? '\0';
  }

  private skipWs(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++;
  }

  next(): Token {
    this.skipWs();
    if (this.pos >= this.src.length) return { type: 'eof' };

    const ch = this.peek();

    // Numbers
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(this.src[this.pos + 1]))) {
      let num = '';
      if (ch === '-') { num = '-'; this.pos++; }
      while (this.pos < this.src.length && /[0-9.]/.test(this.src[this.pos])) {
        num += this.advance();
      }
      return { type: 'num', value: parseFloat(num) };
    }

    // Strings
    if (ch === "'" || ch === '"') {
      const quote = ch;
      this.pos++;
      let str = '';
      while (this.pos < this.src.length && this.src[this.pos] !== quote) {
        const c = this.advance();
        if (c === '\\') str += this.advance();
        else str += c;
      }
      this.pos++; // skip closing quote
      return { type: 'str', value: str };
    }

    // Identifiers / keywords
    if (/[a-zA-Z_$]/.test(ch)) {
      let word = '';
      while (this.pos < this.src.length && /[a-zA-Z_$0-9]/.test(this.src[this.pos])) {
        word += this.advance();
      }
      switch (word) {
        case 'true':  return { type: 'bool', value: true };
        case 'false': return { type: 'bool', value: false };
        case 'null':  return { type: 'null' };
        case 'undefined': return { type: 'undefined' };
        default:
          // Unknown identifier — not supported
          throw new Error(`Unknown identifier: ${word}`);
      }
    }

    // Operators and punctuation
    const twoChar = ch + this.src[this.pos + 1];
    if (['==', '!=', '<=', '>='].includes(twoChar)) {
      this.pos += 2;
      return { type: 'op', value: twoChar };
    }
    if (['+', '-', '*', '/', '%', '<', '>'].includes(ch)) {
      this.pos++;
      return { type: 'op', value: ch };
    }
    if (ch === '(' || ch === ')') { this.pos++; return { type: 'paren', value: ch }; }
    if (ch === '?') { this.pos++; return { type: 'q' }; }
    if (ch === ':') { this.pos++; return { type: 'colon' }; }

    throw new Error(`Unexpected character: ${ch}`);
  }
}

// Parser (recursive descent, minimal — handles our operator set)
class Parser {
  private tok: Token = { type: 'eof' };
  constructor(private tokenizer: Tokenizer) {
    this.advance();
  }

  private advance(): void { this.tok = this.tokenizer.next(); }
  private expect(t: Token['type']): void {
    if (this.tok.type !== t) throw new Error(`Expected ${t}, got ${this.tok.type}`);
    this.advance();
  }

  parse(): unknown {
    const val = this.ternary();
    if (this.tok.type !== 'eof') throw new Error('Unexpected trailing tokens');
    return val;
  }

  // Ternary: a ? b : c
  private ternary(): unknown {
    const cond = this.or();
    if (this.tok.type === 'q') {
      this.advance();
      const t = this.ternary();
      this.expect('colon');
      const f = this.ternary();
      return cond ? t : f;
    }
    return cond;
  }

  // ==  !=  (lowest binary precedence)
  private or(): unknown {
    let left = this.compare();
    while (this.tok.type === 'op' && (this.tok.value === '==' || this.tok.value === '!=')) {
      const op = this.tok.value; this.advance();
      const right = this.compare();
      left = op === '==' ? left == right : left != right;
    }
    return left;
  }

  // <  >  <=  >=
  private compare(): unknown {
    let left = this.add();
    while (this.tok.type === 'op' && ['<', '>', '<=', '>='].includes(this.tok.value)) {
      const op = this.tok.value; this.advance();
      const right = this.add();
      switch (op) {
        case '<':  left = Number(left) < Number(right); break;
        case '>':  left = Number(left) > Number(right); break;
        case '<=': left = Number(left) <= Number(right); break;
        case '>=': left = Number(left) >= Number(right); break;
      }
    }
    return left;
  }

  // +  -  (addition/subtraction)
  private add(): unknown {
    let left = this.mul();
    while (this.tok.type === 'op' && (this.tok.value === '+' || this.tok.value === '-')) {
      const op = this.tok.value; this.advance();
      const right = this.mul();
      if (op === '+') {
        // String concatenation if either side is string
        left = typeof left === 'string' || typeof right === 'string'
          ? String(left) + String(right)
          : Number(left) + Number(right);
      } else {
        left = Number(left) - Number(right);
      }
    }
    return left;
  }

  // *  /  %
  private mul(): unknown {
    let left = this.unary();
    while (this.tok.type === 'op' && ['*', '/', '%'].includes(this.tok.value)) {
      const op = this.tok.value; this.advance();
      const right = this.unary();
      const l = Number(left), r = Number(right);
      switch (op) {
        case '*': left = l * r; break;
        case '/': left = r !== 0 ? l / r : NaN; break;
        case '%': left = r !== 0 ? l % r : NaN; break;
      }
    }
    return left;
  }

  // Unary minus
  private unary(): unknown {
    if (this.tok.type === 'op' && this.tok.value === '-') {
      this.advance();
      const val = this.primary();
      return -(Number(val));
    }
    return this.primary();
  }

  private primary(): unknown {
    const tok = this.tok;
    switch (tok.type) {
      case 'num':       this.advance(); return tok.value;
      case 'str':       this.advance(); return tok.value;
      case 'bool':      this.advance(); return tok.value;
      case 'null':      this.advance(); return null;
      case 'undefined': this.advance(); return undefined;
      case 'paren':
        if (tok.value === '(') {
          this.advance();
          const val = this.ternary();
          this.expect('paren'); // )
          return val;
        }
        throw new Error('Unexpected )');
      default:
        throw new Error(`Unexpected token: ${tok.type}`);
    }
  }
}

export function safeEval(expr: string): unknown {
  const trimmed = expr.trim();
  if (!trimmed) return '';
  try {
    const tokenizer = new Tokenizer(trimmed);
    const parser = new Parser(tokenizer);
    return parser.parse();
  } catch {
    // Parsing failed — return the original token so it degrades gracefully
    return undefined;
  }
}
