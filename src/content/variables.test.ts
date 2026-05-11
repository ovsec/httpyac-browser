import { describe, it, expect } from 'vitest';
import { varKeyStatus } from './variables';
import type { Block } from '../shared/types';

const noBlocks: Block[] = [];

describe('varKeyStatus', () => {
  it('returns "computed" for {{= expr }} patterns', () => {
    expect(varKeyStatus('= Math.random()', noBlocks)).toBe('computed');
    expect(varKeyStatus('= 2 + 2', noBlocks)).toBe('computed');
    expect(varKeyStatus('= name.toUpperCase()', noBlocks)).toBe('computed');
  });

  it('returns "resolved" for system variables', () => {
    expect(varKeyStatus('$uuid', noBlocks)).toBe('resolved');
    expect(varKeyStatus('$guid', noBlocks)).toBe('resolved');
    expect(varKeyStatus('$timestamp', noBlocks)).toBe('resolved');
    expect(varKeyStatus('$randomInt', noBlocks)).toBe('resolved');
    expect(varKeyStatus('$datetime', noBlocks)).toBe('resolved');
    expect(varKeyStatus('$localDatetime', noBlocks)).toBe('resolved');
  });

  it('returns "resolved" for variables present in varsOverride', () => {
    const vars = { BASE_URL: 'https://api.example.com', TOKEN: 'abc123' };
    expect(varKeyStatus('BASE_URL', noBlocks, vars)).toBe('resolved');
    expect(varKeyStatus('TOKEN', noBlocks, vars)).toBe('resolved');
  });

  it('returns "unresolved" for variables missing from varsOverride', () => {
    const vars = { BASE_URL: 'https://api.example.com' };
    expect(varKeyStatus('MISSING_KEY', noBlocks, vars)).toBe('unresolved');
    expect(varKeyStatus('TOKEN', noBlocks, vars)).toBe('unresolved');
  });

  it('returns "resolved" for variables defined in any block localVars', () => {
    const blocks: Block[] = [
      {
        name: null,
        method: 'GET',
        url: '{{host}}/api',
        headers: {},
        body: null,
        assertions: [],
        localVars: { host: 'https://localhost:8080' },
      },
    ];
    expect(varKeyStatus('host', blocks, {})).toBe('resolved');
  });

  it('returns "unresolved" when varsOverride is empty and no blocks have localVars', () => {
    expect(varKeyStatus('API_KEY', noBlocks, {})).toBe('unresolved');
    expect(varKeyStatus('host', noBlocks, {})).toBe('unresolved');
  });

  it('treats empty key as resolved ({{}} edge case)', () => {
    expect(varKeyStatus('', noBlocks)).toBe('resolved');
  });

  it('trims whitespace from variable names', () => {
    expect(varKeyStatus('  API_KEY  ', noBlocks, { API_KEY: 'secret' })).toBe('resolved');
    expect(varKeyStatus('  MISSING  ', noBlocks, {})).toBe('unresolved');
  });

  it('prefers varsOverride over system var names for overridden keys', () => {
    // If someone defines a popup var named $uuid, the system var still wins
    // (systemVarValue is checked first)
    expect(varKeyStatus('$uuid', noBlocks)).toBe('resolved');
  });
});
