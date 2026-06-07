import { describe, it, expect } from 'vitest';
import { AdjunctSandbox } from '../../src/core/services/AdjunctSandbox';

// L1 — the sandbox's static code filter is the unit-testable security gate.
// (Worker/Blob-URL execution is browser-only; covered by E2E, not here.)

describe('AdjunctSandbox.validateCode (static security filter)', () => {
  it('accepts benign adjunct code', () => {
    expect(() => AdjunctSandbox.validateCode('const hooks = { reg: () => ({ name: "x" }) };')).not.toThrow();
  });

  const FORBIDDEN: Array<[string, string]> = [
    ['eval', 'eval("1+1")'],
    ['new Function', 'const f = new Function("return 1");'],
    ['fetch', 'fetch("http://evil")'],
    ['setTimeout', 'setTimeout(() => {}, 0)'],
    ['setInterval', 'setInterval(() => {}, 0)'],
    ['import()', 'await import("evil")'],
    ['require', 'require("fs")'],
    ['XMLHttpRequest', 'new XMLHttpRequest()'],
    ['localStorage', 'localStorage.getItem("x")'],
    ['document.', 'document.createElement("div")'],
    ['window.', 'window.location = "x"'],
    ['navigator.', 'navigator.userAgent'],
    ['process.', 'process.exit(1)'],
    ['__proto__', 'const o = {}; o.__proto__ = {};'],
  ];

  for (const [name, code] of FORBIDDEN) {
    it(`rejects ${name}`, () => {
      expect(() => AdjunctSandbox.validateCode(code)).toThrow(/Forbidden code pattern/);
    });
  }

  it('rejects oversized code (>100KB)', () => {
    expect(() => AdjunctSandbox.validateCode('x'.repeat(100 * 1024 + 1))).toThrow(/too large/);
  });

  it('can be constructed in Node without spawning a Worker (lazy init)', () => {
    expect(() => new AdjunctSandbox({ timeout: 1000 })).not.toThrow();
  });
});
