import { describe, it, expect } from 'vitest';
import { safeEval } from './safe-eval';

describe('safeEval', () => {
  it('evaluates numeric addition', () => {
    expect(safeEval('2 + 2')).toBe(4);
  });

  it('evaluates subtraction', () => {
    expect(safeEval('10 - 3')).toBe(7);
  });

  it('evaluates multiplication', () => {
    expect(safeEval('3 * 4')).toBe(12);
  });

  it('evaluates division', () => {
    expect(safeEval('10 / 2')).toBe(5);
  });

  it('evaluates modulo', () => {
    expect(safeEval('10 % 3')).toBe(1);
  });

  it('evaluates operator precedence (* before +)', () => {
    expect(safeEval('2 + 3 * 4')).toBe(14);
  });

  it('evaluates parenthesized expressions', () => {
    expect(safeEval('(2 + 3) * 4')).toBe(20);
  });

  it('handles unary minus', () => {
    expect(safeEval('-5')).toBe(-5);
    expect(safeEval('--5')).toBe(5);
  });

  it('evaluates equality', () => {
    expect(safeEval('1 == 1')).toBe(true);
    expect(safeEval('1 == 2')).toBe(false);
  });

  it('evaluates inequality', () => {
    expect(safeEval('1 != 2')).toBe(true);
    expect(safeEval('1 != 1')).toBe(false);
  });

  it('evaluates comparisons', () => {
    expect(safeEval('3 < 5')).toBe(true);
    expect(safeEval('5 <= 5')).toBe(true);
    expect(safeEval('4 > 2')).toBe(true);
    expect(safeEval('4 >= 4')).toBe(true);
  });

  it('evaluates ternary', () => {
    expect(safeEval('true ? "yes" : "no"')).toBe('yes');
    expect(safeEval('false ? "yes" : "no"')).toBe('no');
  });

  it('handles string concatenation with +', () => {
    expect(safeEval('"hello" + " " + "world"')).toBe('hello world');
  });

  it('handles string + number concatenation', () => {
    expect(safeEval('"count: " + 42')).toBe('count: 42');
  });

  it('handles number + string concatenation', () => {
    expect(safeEval('42 + " items"')).toBe('42 items');
  });

  it('handles boolean literals', () => {
    expect(safeEval('true')).toBe(true);
    expect(safeEval('false')).toBe(false);
  });

  it('handles null', () => {
    expect(safeEval('null')).toBeNull();
    expect(typeof safeEval('null')).toBe('object');
  });

  it('handles undefined', () => {
    expect(safeEval('undefined')).toBeUndefined();
  });

  it('handles floating-point numbers', () => {
    expect(safeEval('3.14')).toBeCloseTo(3.14);
    expect(safeEval('1.5 + 2.5')).toBe(4);
  });

  it('does not execute function calls', () => {
    // Should return undefined (fails gracefully) for unknown identifiers
    expect(safeEval('Math.max(1,2)')).toBeUndefined();
  });

  it('does not allow property access', () => {
    expect(safeEval('({}).constructor')).toBeUndefined();
  });

  it('does not allow eval-like constructs', () => {
    expect(safeEval('eval("1+1")')).toBeUndefined();
  });

  it('returns empty string for empty input', () => {
    expect(safeEval('')).toBe('');
    expect(safeEval('   ')).toBe('');
  });

  it('handles nested ternary', () => {
    expect(safeEval('true ? (false ? "a" : "b") : "c"')).toBe('b');
  });

  it('handles chained comparisons', () => {
    // (1 < 2) < 3 → true < 3 → 1 < 3 → true
    expect(safeEval('1 < 2 < 3')).toBe(true);
  });
});
