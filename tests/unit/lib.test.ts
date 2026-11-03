// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { slugError, suggestSlug, uniqueSlug } from '../../src/lib/slug';
import { effective, portsMismatch, lockedText } from '../../src/lib/connections';
import { parseMarkdown, parseInline, safeHref } from '../../src/lib/markdown';
import { validateSafeSvg, validateGmm } from '../../src/lib/svg-gmm';
import { search, fuzzy } from '../../src/lib/search';
import { undoConflict, type UndoEntry } from '../../src/lib/undo';
import { joinNames } from '../../src/lib/status';
import type { Connection, Module } from '../../src/lib/types';

const mod = (id: string, slug: string, status: 0 | 1 | 2 | 3, o: Partial<Module> = {}): Module => ({
  id,
  slug,
  status,
  tier: 0,
  order: 0,
  purpose: '',
  hasModel: false,
  ports: { in: 'none', out: 'none' },
  leaderUid: null,
  leaderInitials: null,
  createdAt: null,
  createdBy: '',
  updatedAt: null,
  updatedBy: '',
  deletedAt: null,
  ...o,
});
const conn = (aId: string, bId: string, state: 1 | 2 | 3): Connection => ({
  id: `${aId}__${bId}`,
  slug: 'x-y',
  aId,
  bId,
  state,
  createdAt: null,
  createdBy: '',
  updatedAt: null,
  updatedBy: '',
  deletedAt: null,
});

describe('slug', () => {
  it('accepts good slugs', () => expect(slugError('intake-ramp')).toBeNull());
  it('rejects short', () => expect(slugError('a')).toMatch(/at least 2/));
  it('rejects long with count, never truncates', () => expect(slugError('a'.repeat(33))).toMatch(/now 33/));
  it('rejects shape', () => ['Ramp', 'a--b', '-a', 'a_b', 'a b'].forEach((s) => expect(slugError(s)).toMatch(/lowercase/)));
  it('rejects reserved', () => expect(slugError('manage')).toMatch(/reserved/));
  it('rejects taken', () => expect(slugError('ramp-feed', (s) => s === 'ramp-feed')).toMatch(/already/));
  it('suggests from words', () => expect(suggestSlug('Ramp feeds the gears!')).toBe('ramp-feeds'));
  it('uniquifies', () => expect(uniqueSlug('a-b', (s) => s === 'a-b')).toBe('a-b-2'));
});

describe('connection state', () => {
  it('locked when an end is not done, names the module', () => {
    const e = effective(conn('a', 'b', 1), mod('a', 'a', 3), mod('b', 'lift-arm', 2));
    expect(e.state).toBe('locked');
    expect(e.waitingFor.map((m) => m.slug)).toEqual(['lift-arm']);
  });
  it('ready when both done', () => expect(effective(conn('a', 'b', 1), mod('a', 'a', 3), mod('b', 'b', 3)).state).toBe('ready'));
  it('stored connected but regressed shows was connected', () => {
    const e = effective(conn('a', 'b', 3), mod('a', 'a', 2), mod('b', 'b', 3));
    expect(lockedText(e)).toBe('Locked (was connected)');
  });
  it('adapter needed is separate from state', () => {
    const e = effective(conn('a', 'b', 1), mod('a', 'a', 3, { ports: { in: 'none', out: 'spin' } }), mod('b', 'b', 3, { ports: { in: 'push', out: 'none' } }));
    expect(e.state).toBe('ready');
    expect(e.adapter).toBe(true);
  });
  it('none/other never mismatch', () => expect(portsMismatch('none', 'ball') || portsMismatch('other', 'spin')).toBe(false));
});

describe('markdown subset', () => {
  it('parses headings, lists, bold, italic', () => {
    const b = parseMarkdown('# Title\n\nSome **bold** and *it*.\n\n- one\n- two\n\n1. a');
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'ul', 'ol']);
  });
  const payloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '[x](javascript:alert(1))',
    '[x](data:text/html,hi)',
    '[x](http://insecure.example)',
    '<a href="https://x">y</a>',
    '[x](JaVaScRiPt:alert(1))',
    '"><svg onload=alert(1)>',
  ];
  it.each(payloads)('never produces a non-https link or raw HTML node: %s', (p) => {
    const json = JSON.stringify(parseMarkdown(p));
    const links = [...json.matchAll(/"href":"([^"]+)"/g)].map((m) => m[1]);
    links.forEach((h) => expect(h.startsWith('https://')).toBe(true));
    expect(json).not.toMatch(/"t":"(html|raw)"/);
  });
  it('raw HTML stays literal text', () => expect(parseInline('<b>x</b>')).toEqual([{ t: 'text', v: '<b>x</b>' }]));
  it('keeps https links', () => expect(safeHref('https://example.org/a')).toBe('https://example.org/a'));
});

const gmm = (body = '', vb = '0 0 400 300') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">
<g id="envelope"><rect x="20" y="20" width="360" height="260" stroke-dasharray="4 4" fill="none" stroke="currentColor"/></g>
<g id="parts"><g id="ramp"><path d="M20 20 L100 100" stroke="currentColor"/></g></g>
<g id="ports"><circle id="out-1" r="6" cx="380" cy="150" data-kind="out" data-carries="ball"/></g>
<g id="labels"><text x="30" y="40">1</text></g>${body}
<metadata id="gmm">{"standard":"GMM v1","slug":"x","purpose":"","sizeMm":{"w":0,"h":0,"d":0},"ports":[]}</metadata></svg>`;

describe('svg validation', () => {
  it('accepts a valid GMM file', () => expect(validateGmm(gmm()).ok).toBe(true));
  const evil: [string, string][] = [
    ['script', '<script>alert(1)</script>'],
    ['onload', '<g onload="alert(1)"></g>'],
    ['foreignObject', '<foreignObject><div/></foreignObject>'],
    ['use', '<use href="#x"/>'],
    ['image', '<image href="https://evil/x.png"/>'],
    ['xlink', '<a xlink:href="javascript:alert(1)" xmlns:xlink="http://www.w3.org/1999/xlink"/>'],
    ['style url', '<rect style="fill:url(https://evil/x)"/>'],
    ['fill url', '<rect fill="url(#g)"/>'],
    ['animate', '<animate attributeName="x"/>'],
  ];
  it.each(evil)('rejects %s', (_n, frag) => expect(validateGmm(gmm(frag)).ok).toBe(false));
  it('rejects entity declarations', () => expect(validateSafeSvg('<!DOCTYPE svg [<!ENTITY a "b">]><svg/>').ok).toBe(false));
  it('rejects wrong viewBox with a specific message', () => {
    const r = validateGmm(gmm('', '0 0 100 100'));
    expect(r.ok === false && r.error).toMatch(/viewBox/);
  });
  it('rejects missing group', () => expect(validateGmm('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"/>').ok).toBe(false));
  it('rejects oversize', () => expect(validateGmm(gmm(`<desc>${'x'.repeat(40000)}</desc>`)).ok).toBe(false));
  it('generic vectors need no GMM structure', () => expect(validateSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>').ok).toBe(true));
  it('rejects non-svg', () => expect(validateSafeSvg('<html/>').ok).toBe(false));
});

describe('search', () => {
  const ms = [mod('1', 'intake-ramp', 3, { purpose: 'Starts the ball', leaderInitials: 'P1' }), mod('2', 'lift-arm', 2)];
  it('prefix beats fuzzy', () => expect(fuzzy('lif', 'lift-arm')).toBeGreaterThan(fuzzy('lam', 'lift-arm')));
  it('matches slug, purpose words, initials and connection ends', () => {
    expect(search('lift', ms, [])[0].slug).toBe('lift-arm');
    expect(search('ball', ms, [])[0].slug).toBe('intake-ramp');
    expect(search('p1', ms, [])[0].slug).toBe('intake-ramp');
    expect(
      search(
        'intake',
        [],
        [conn('1', '2', 1)].map((c) => c),
        8,
      ).length,
    ).toBe(0);
    expect(search('intake', ms, [{ ...conn('1', '2', 1), slug: 'ramp-feed' }]).some((h) => h.kind === 'connection')).toBe(true);
  });
  it('empty query returns nothing', () => expect(search('  ', ms, [])).toEqual([]));
});

describe('undo engine', () => {
  const e: UndoEntry = { label: 'x', wrote: { status: 2 }, targetPath: 'modules/a', run: async () => {}, at: 0 };
  it('safe when unchanged', () => expect(undoConflict(e, { status: 2, updatedBy: 'me' }, 'me')).toBe(false));
  it('conflict when someone else wrote', () => expect(undoConflict(e, { status: 2, updatedBy: 'other' }, 'me')).toBe(true));
  it('conflict when the field changed', () => expect(undoConflict(e, { status: 3, updatedBy: 'me' }, 'me')).toBe(true));
  it('conflict when the doc is gone', () => expect(undoConflict(e, undefined, 'me')).toBe(true));
  it('no target never conflicts', () => expect(undoConflict({ ...e, targetPath: null }, undefined, 'me')).toBe(false));
});

describe('copy helpers', () => {
  it('joins names', () => expect(joinNames(['a', 'b', 'c'])).toBe('a, b and c'));
});
