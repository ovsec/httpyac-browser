import { describe, it, expect } from 'vitest';
import { evaluateAssertions } from './assertions';
import type { ExecResponse } from '../shared/types';

function makeRes(overrides: Partial<ExecResponse> = {}): ExecResponse {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Alice', count: 42, items: [1, 2, 3], active: true }),
    time: 120,
    ...overrides,
  };
}

describe('evaluateAssertions', () => {
  it('passes status == 200', () => {
    const res = makeRes({ status: 200 });
    const results = evaluateAssertions(['status == 200'], res);
    expect(results[0].pass).toBe(true);
  });

  it('fails status == 404 on wrong status', () => {
    const res = makeRes({ status: 404 });
    const results = evaluateAssertions(['status == 200'], res);
    expect(results[0].pass).toBe(false);
  });

  it('passes status != 404', () => {
    const res = makeRes({ status: 200 });
    const results = evaluateAssertions(['status != 404'], res);
    expect(results[0].pass).toBe(true);
  });

  it('passes duration < 500', () => {
    const res = makeRes({ time: 120 });
    const results = evaluateAssertions(['duration < 500'], res);
    expect(results[0].pass).toBe(true);
  });

  it('fails duration > 100 on fast response', () => {
    const res = makeRes({ time: 50 });
    const results = evaluateAssertions(['duration > 100'], res);
    expect(results[0].pass).toBe(false);
  });

  it('passes body.name == "Alice"', () => {
    const results = evaluateAssertions(['body.name == "Alice"'], makeRes());
    expect(results[0].pass).toBe(true);
  });

  it('passes body.count >= 42', () => {
    const results = evaluateAssertions(['body.count >= 42'], makeRes());
    expect(results[0].pass).toBe(true);
  });

  it('passes body.items isArray', () => {
    const results = evaluateAssertions(['body.items isArray'], makeRes());
    expect(results[0].pass).toBe(true);
  });

  it('fails body.items isString', () => {
    const results = evaluateAssertions(['body.items isString'], makeRes());
    expect(results[0].pass).toBe(false);
  });

  it('passes body.items[0] == 1', () => {
    const results = evaluateAssertions(['body.items[0] == 1'], makeRes());
    expect(results[0].pass).toBe(true);
  });

  it('passes body.active isTrue', () => {
    const results = evaluateAssertions(['body.active isTrue'], makeRes());
    expect(results[0].pass).toBe(true);
  });

  it('passes header content-type includes json', () => {
    const results = evaluateAssertions(['header content-type includes json'], makeRes());
    expect(results[0].pass).toBe(true);
  });

  it('passes header content-type exists', () => {
    const results = evaluateAssertions(['header content-type exists'], makeRes());
    expect(results[0].pass).toBe(true);
  });

  it('fails header x-missing exists', () => {
    const results = evaluateAssertions(['header x-missing exists'], makeRes());
    expect(results[0].pass).toBe(false);
  });

  it('passes body.name startsWith "Ali"', () => {
    const results = evaluateAssertions(['body.name startsWith "Ali"'], makeRes());
    expect(results[0].pass).toBe(true);
  });

  it('passes body.name endsWith "ice"', () => {
    const results = evaluateAssertions(['body.name endsWith "ice"'], makeRes());
    expect(results[0].pass).toBe(true);
  });

  it('passes body.name matches "^Ali"', () => {
    const results = evaluateAssertions(['body.name matches "^Ali"'], makeRes());
    expect(results[0].pass).toBe(true);
  });

  it('handles body that is not JSON (raw string)', () => {
    const res = makeRes({ body: 'Hello World' });
    const results = evaluateAssertions(['body exists'], res);
    expect(results[0].pass).toBe(true);
  });

  it('handles empty body — body exists passes because field is present', () => {
    const res = makeRes({ body: '' });
    const results = evaluateAssertions(['body exists'], res);
    // Empty string is != null, so exists passes
    expect(results[0].pass).toBe(true);
  });

  it('returns empty array for no assertions', () => {
    const results = evaluateAssertions([], makeRes());
    expect(results).toEqual([]);
  });

  it('reports failure details correctly', () => {
    const res = makeRes({ status: 500 });
    const results = evaluateAssertions(['status == 200'], res);
    expect(results[0].pass).toBe(false);
    expect(results[0].actual).toBe(500);
    expect(results[0].expected).toBe(200);
  });
});
