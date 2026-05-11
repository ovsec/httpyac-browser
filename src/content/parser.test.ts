import { describe, it, expect } from 'vitest';
import { parseBlock, parseText } from './parser';

describe('parseBlock', () => {
  it('parses a minimal GET request', () => {
    const result = parseBlock('GET https://api.example.com/users', null);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('GET');
    expect(result!.url).toBe('https://api.example.com/users');
    expect(result!.name).toBeNull();
  });

  it('parses a POST with headers and body and assertions', () => {
    const text = [
      '# @name CreateUser',
      'POST https://api.example.com/users',
      'Content-Type: application/json',
      'Authorization: Bearer token123',
      '',
      '{"name": "Alice"}',
      '?? status == 201',
      '?? body.id exists',
    ].join('\n');

    const result = parseBlock(text, null);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('CreateUser');
    expect(result!.method).toBe('POST');
    expect(result!.headers['Content-Type']).toBe('application/json');
    expect(result!.headers['Authorization']).toBe('Bearer token123');
    expect(result!.body).toBe('{"name": "Alice"}');
    expect(result!.assertions).toEqual(['status == 201', 'body.id exists']);
  });

  it('returns null for text without a valid HTTP method line', () => {
    const result = parseBlock('just some random text\nnot a request', null);
    expect(result).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(parseBlock('', null)).toBeNull();
  });

  it('skips @name and inline @var lines before the request', () => {
    const text = [
      '# @name GetUsers',
      '@baseUrl = https://api.example.com',
      'GET {{baseUrl}}/users',
    ].join('\n');
    const result = parseBlock(text, null);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('GetUsers');
    expect(result!.localVars['baseUrl']).toBe('https://api.example.com');
  });

  it('parses all HTTP methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'];
    for (const method of methods) {
      const result = parseBlock(`${method} https://example.com`, null);
      expect(result).not.toBeNull();
      expect(result!.method).toBe(method);
    }
  });

  it('parses relative URLs with host variable', () => {
    const result = parseBlock('GET /api/v1/users', null);
    expect(result).not.toBeNull();
    expect(result!.url).toBe('/api/v1/users');
  });

  it('ignores comment lines starting with # or //', () => {
    const text = [
      '# this is a comment',
      '// also a comment',
      'GET https://example.com',
    ].join('\n');
    const result = parseBlock(text, null);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('GET');
  });

  it('includes trailing ??? lines as body, not assertions', () => {
    // Only ?? at the start of a line (after trim) is an assertion
    const text = [
      'POST https://example.com',
      'Content-Type: text/plain',
      '',
      'some ?? text in body',
      '?? status == 200',
    ].join('\n');
    const result = parseBlock(text, null);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('some ?? text in body');
    expect(result!.assertions).toEqual(['status == 200']);
  });
});

describe('parseText', () => {
  it('parses multiple blocks separated by ###', () => {
    const text = [
      'GET https://api.example.com/users',
      '',
      '###',
      '',
      'POST https://api.example.com/users',
      'Content-Type: application/json',
      '',
      '{"name": "Bob"}',
    ].join('\n');

    const blocks = parseText(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].method).toBe('GET');
    expect(blocks[1].method).toBe('POST');
  });

  it('parses blocks with ### name annotation', () => {
    const text = [
      '### Get Users',
      'GET https://api.example.com/users',
      '',
      '### Create User',
      'POST https://api.example.com/users',
    ].join('\n');

    const blocks = parseText(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].name).toBe('Get Users');
    expect(blocks[1].name).toBe('Create User');
  });

  it('hoists global @var definitions into all blocks', () => {
    const text = [
      '@baseUrl = https://api.example.com',
      '',
      '###',
      'GET {{baseUrl}}/users',
      '',
      '###',
      'POST {{baseUrl}}/items',
    ].join('\n');

    const blocks = parseText(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].localVars['baseUrl']).toBe('https://api.example.com');
    expect(blocks[1].localVars['baseUrl']).toBe('https://api.example.com');
  });

  it('returns empty array for text with no request blocks', () => {
    expect(parseText('just some text')).toEqual([]);
    expect(parseText('')).toEqual([]);
    expect(parseText('###\n###\n###')).toEqual([]);
  });

  it('parses a preamble block before any ### separator', () => {
    const text = [
      'GET https://api.example.com/health',
      '',
      '###',
      'POST https://api.example.com/data',
    ].join('\n');

    const blocks = parseText(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].url).toContain('/health');
    expect(blocks[1].url).toContain('/data');
  });
});
