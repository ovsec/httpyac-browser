// ── Core data structures ──────────────────────────────────────────────────────

export interface Block {
  name: string | null;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  assertions: string[];
  localVars: Record<string, string>;
}

export interface AssertResult {
  expr: string;
  pass: boolean;
  actual: unknown;
  expected?: unknown;
  op?: string;
  error?: string;
}

export interface Result {
  state: 'running' | 'done' | 'error';
  ok: boolean;
  httpOk: boolean;
  status: number;
  statusText: string;
  time: number;
  headers: Record<string, string>;
  body: string;
  assertResults: AssertResult[];
}

export interface ExecResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
}

export interface Entry {
  shadow: ShadowRoot | null;
  blocks: Block[];
  results: (Result | null)[];
  el: HTMLElement;
  wrapper: HTMLElement;
  offsets: number[];
  render: () => void;
}

export type IconState = 'default' | 'running' | 'success' | 'error';

export interface Stats {
  total: number;
  done: number;
  ok: number;
  err: number;
  requests: RequestSummary[];
}

export interface RequestSummary {
  method: string;
  url: string;
  name: string | null;
  state: string | null;
  ok: boolean | null;
  httpOk: boolean | null;
  status: number | null;
  statusText: string | null;
  time: number | null;
  assertTotal: number;
  assertFail: number;
}

// ── Message protocol ─────────────────────────────────────────────────────────

export type PopupMessage =
  | { type: 'SCAN' }
  | { type: 'STATS' }
  | { type: 'RUN_ALL' }
  | { type: 'RUN_ONE'; index: number }
  | { type: 'SCROLL_TO'; index: number }
  | { type: 'GET_REPORT' };

export type ContentMessage =
  | { type: 'EXECUTE'; request: ResolvedRequest; vars: Record<string, string> }
  | { type: 'SET_ICON'; state: IconState };

export interface ResolvedRequest {
  name: string | null;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  assertions: string[];
  localVars: Record<string, string>;
}

export interface ReportRow {
  method: string;
  name: string | null;
  url: string;
  resolvedUrl: string;
  headers: Record<string, string>;
  resolvedHeaders: Record<string, string>;
  body: string | null;
  resolvedBody: string | null;
  assertions: string[];
  state: string | null;
  ok: boolean | null;
  status: number | null;
  statusText: string | null;
  time: number | null;
  resHeaders: Record<string, string>;
  resBody: string | null;
  assertResults: AssertResult[];
}
