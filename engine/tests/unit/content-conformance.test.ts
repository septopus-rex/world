import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isCid } from '../../src/core/services/ipfs';

// ─── The content gate ────────────────────────────────────────────────────────
//
// Every world-content JSON under client/core/src (blocks / levels / stylepacks /
// manifest) is validated here against the protocol's RESOURCE and SHAPE rules.
// This is the world-content counterpart of a lint gate: any agent (human or AI)
// that authors content which violates the wire contract gets a red test in CI,
// not a silent side-door in the engine.
//
// The rules enforced (see protocol/cn|en/):
//   · adjunct-types.md §2 — standard 7-slot types: raw[3] is a COLOUR/PALETTE
//     INDEX (number). Never a texture path. a1/a5/a6/a7 slot 7 = colour.
//   · texture.md §9 — textures ride a2 box raw[7] ONLY, as a catalog id or
//     `<cid>.<ext>`; resource.md §6 has the same table.
//   · adjunct-types.md §4 — a4 module resourceId: numeric id / scheme URL /
//     `<cid>.<ext>`. HOST-RELATIVE paths (`/assets/…`) are banned in content:
//     content must stay CID-able (chain boot serves it from a different host).
//     The dev indirection point for paths is demo.manifest.json — nowhere else.
//   · trigger.md §4/§6 — node types and the 11-action set.
//
// Scope is deliberate: types with bespoke layouts (e-family, ba npc, b9, c1/c2,
// dynamic 0xf001+) are shape-checked only where the protocol pins them down.
// Extend per-type as specs firm up; do NOT weaken a rule to admit content —
// non-conformant content is the bug (2026-07-21: an external AI hard-coded
// `/assets/*.png` into a stylepack and re-pointed engine slots to make it
// render; this file exists so that fails loudly next time).

const CONTENT = path.resolve(__dirname, '../../../client/core/src');
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const listFiles = (dir: string, suffix: string) =>
    fs.readdirSync(path.join(CONTENT, dir)).filter(f => f.endsWith(suffix)).sort();

/** `<cid>.<ext>` — content-addressed stem + filename-style format suffix. */
const isCidExt = (s: string) => {
    const dot = s.lastIndexOf('.');
    return dot > 0 && isCid(s.slice(0, dot));
};
const isSchemeUrl = (s: string) => /^(https?:|data:|blob:|file:)/.test(s);

const TRIGGER_TYPES = new Set(['in', 'out', 'hold', 'touch']);
const ACTION_TYPES = new Set([
    'adjunct', 'flag', 'bag', 'player', 'sound', 'system',
    'delay', 'spawn', 'despawn', 'damage', 'projectile',
]);

// Cross-file reference pools, filled while walking blocks/levels/stylepacks and
// checked against the manifest at the end (a dangling id = invisible content).
const usedTextureIds = new Set<number>();
const usedModuleIds = new Set<number>();
const usedAudioIds = new Set<number>();

type Err = string;

function checkActions(actions: any, where: string, errs: Err[]): void {
    if (actions == null) return;
    if (!Array.isArray(actions)) { errs.push(`${where}: actions is not an array`); return; }
    for (const [i, a] of actions.entries()) {
        const at = `${where}.actions[${i}]`;
        if (!a || typeof a !== 'object') { errs.push(`${at}: not an object`); continue; }
        if (!ACTION_TYPES.has(a.type)) errs.push(`${at}: unknown action type ${JSON.stringify(a.type)}`);
        if (a.type === 'sound' && typeof a.target === 'number') usedAudioIds.add(a.target);
        if (a.type === 'delay') checkActions(a.actions, at, errs);
        if (a.type === 'spawn' && Array.isArray(a.params) && Array.isArray(a.params[1])) {
            checkRow(a.params[0], a.params[1], `${at}.spawn`, errs);
        }
    }
}

function checkTriggerNodes(nodes: any, where: string, errs: Err[]): void {
    if (nodes == null) return;
    if (!Array.isArray(nodes)) { errs.push(`${where}: trigger nodes is not an array`); return; }
    for (const [i, n] of nodes.entries()) {
        const at = `${where}[${i}]`;
        if (!n || typeof n !== 'object') { errs.push(`${at}: not an object`); continue; }
        if (!TRIGGER_TYPES.has(n.type)) errs.push(`${at}: unknown trigger type ${JSON.stringify(n.type)}`);
        checkActions(n.actions, at, errs);
        checkActions(n.fallbackActions, `${at}(fallback)`, errs);
    }
}

/** Per-row resource-slot rules for the types the protocol pins down. */
function checkRow(typeId: any, row: any, where: string, errs: Err[]): void {
    if (!Array.isArray(row)) { errs.push(`${where}: row is not an array`); return; }
    switch (typeId) {
        // Standard 7-slot primitives: slot 3 = colour/palette INDEX, slot 7 = colour.
        case 0xa1: case 0xa5: case 0xa6: case 0xa7: {
            if (row[3] != null && typeof row[3] !== 'number') {
                errs.push(`${where}: slot 3 must be a numeric colour/palette index (a1/a5/a6/a7 have NO texture slot — texture.md §9), got ${JSON.stringify(row[3])}`);
            }
            if (row.length > 7 && row[7] != null && typeof row[7] !== 'number') {
                errs.push(`${where}: slot 7 must be a numeric colour, got ${JSON.stringify(row[7])}`);
            }
            break;
        }
        // a2 box: slot 3 = colour index; texture ONLY at slot 7 (catalog id or <cid>.<ext>).
        case 0xa2: {
            if (row[3] != null && typeof row[3] !== 'number') {
                errs.push(`${where}: a2 slot 3 must be a numeric colour/palette index, got ${JSON.stringify(row[3])}`);
            }
            const tex = row.length > 7 ? row[7] : undefined;
            if (typeof tex === 'number') usedTextureIds.add(tex);
            else if (typeof tex === 'string' && !isCidExt(tex) && !isCid(tex)) {
                errs.push(`${where}: a2 slot 7 texture must be a catalog id or <cid>.<ext>, got ${JSON.stringify(tex)}`);
            }
            break;
        }
        // a4 module: numeric id / scheme URL / <cid>.<ext>; host-relative paths banned.
        case 0xa4: {
            const r = row[3];
            if (typeof r === 'number') usedModuleIds.add(r);
            else if (typeof r === 'string' && !isSchemeUrl(r) && !isCidExt(r)) {
                errs.push(`${where}: a4 resource must be a catalog id, scheme URL or <cid>.<ext> (adjunct-types.md §4) — host-relative paths break chain boot, got ${JSON.stringify(r)}`);
            }
            break;
        }
        // b8 trigger: slot 5 = logic nodes, slot 6 = optional anchor {name}.
        case 0xb8: {
            checkTriggerNodes(row[5], `${where}.nodes`, errs);
            if (row[6] != null && typeof row[6]?.name !== 'string') {
                errs.push(`${where}: anchor (slot 6) must be { name, when? }`);
            }
            break;
        }
        // b6 spp: [origin, cells, theme] — theme is an id/CID ref, never a path.
        case 0xb6: {
            const [origin, cells, theme] = row;
            if (!Array.isArray(origin) || origin.length < 2) errs.push(`${where}: b6 origin must be a coordinate array`);
            if (!Array.isArray(cells)) errs.push(`${where}: b6 cells must be an array`);
            if (typeof theme !== 'string' || theme.startsWith('/') || isSchemeUrl(theme)) {
                errs.push(`${where}: b6 theme must be a StylePack id/CID ref, got ${JSON.stringify(theme)}`);
            }
            for (const [ci, cell] of (Array.isArray(cells) ? cells : []).entries()) {
                const at = `${where}.cells[${ci}]`;
                if (!Array.isArray(cell?.position) || cell.position.length !== 3) errs.push(`${at}: position must be [x,y,z]`);
                if (cell?.faces != null && (!Array.isArray(cell.faces) || cell.faces.length !== 6)) errs.push(`${at}: faces must have 6 entries`);
                checkTriggerNodes(cell?.trigger, `${at}.trigger`, errs);
            }
            break;
        }
        // Other types (e-family, ba, b9, c1/c2, dynamic ids…): bespoke layouts,
        // validated by their own systems/tests — no slot rules imposed here.
    }
}

/** Block raw five-tuple: [ver, flag, groups, animations, game]. */
function checkBlockRaw(raw: any, where: string, errs: Err[]): void {
    if (!Array.isArray(raw)) { errs.push(`${where}: block raw is not an array`); return; }
    if (!Array.isArray(raw[2])) { errs.push(`${where}: raw[2] adjunct groups missing`); return; }
    if (raw[3] != null && !Array.isArray(raw[3])) errs.push(`${where}: raw[3] animations must be an array`);
    if (raw[4] != null && typeof raw[4] !== 'number') errs.push(`${where}: raw[4] game flag must be a number`);
    for (const [gi, group] of raw[2].entries()) {
        const at = `${where}.groups[${gi}]`;
        if (!Array.isArray(group) || typeof group[0] !== 'number' || !Array.isArray(group[1])) {
            errs.push(`${at}: group must be [typeId, rows[]]`); continue;
        }
        for (const [ri, row] of group[1].entries()) checkRow(group[0], row, `${at}(0x${group[0].toString(16)})[${ri}]`, errs);
    }
}

// ─── blocks/*.block.json ─────────────────────────────────────────────────────

describe('content gate — blocks', () => {
    for (const f of listFiles('blocks', '.block.json')) {
        it(`${f} conforms`, () => {
            const errs: Err[] = [];
            checkBlockRaw(readJson(path.join(CONTENT, 'blocks', f)), f, errs);
            expect(errs).toEqual([]);
        });
    }
});

// ─── levels/*.level.json ─────────────────────────────────────────────────────

describe('content gate — levels', () => {
    for (const f of listFiles('levels', '.level.json')) {
        it(`${f} conforms`, () => {
            const errs: Err[] = [];
            const level = readJson(path.join(CONTENT, 'levels', f));
            if (typeof level.name !== 'string') errs.push(`${f}: missing name`);
            if (!Array.isArray(level.blocks)) errs.push(`${f}: missing blocks[]`);
            for (const [i, b] of (level.blocks ?? []).entries()) {
                const at = `${f}.blocks[${i}]`;
                if (typeof b?.x !== 'number' || typeof b?.y !== 'number') errs.push(`${at}: needs numeric x/y`);
                if (Array.isArray(b?.raw)) checkBlockRaw(b.raw, at, errs);
                else if (typeof b?.ref !== 'string') errs.push(`${at}: needs raw[] or ref`);
            }
            if (level.fallback != null && typeof level.fallback?.ref !== 'string' && !Array.isArray(level.fallback?.raw)) {
                errs.push(`${f}: fallback must be { ref } or { raw }`);
            }
            if (level.include != null && !Array.isArray(level.include)) errs.push(`${f}: include must be an array`);
            expect(errs).toEqual([]);
        });
    }
});

// ─── stylepacks/*.stylepack.json ─────────────────────────────────────────────

describe('content gate — stylepacks', () => {
    for (const f of listFiles('stylepacks', '.stylepack.json')) {
        it(`${f} conforms`, () => {
            const errs: Err[] = [];
            const p = path.join(CONTENT, 'stylepacks', f);
            const pack = readJson(p);
            if (pack.id !== f.replace('.stylepack.json', '')) errs.push(`${f}: pack id must match the filename stem`);
            if (typeof pack.thickness !== 'number') errs.push(`${f}: missing thickness`);
            if (!Array.isArray(pack.closed) || !Array.isArray(pack.open)) errs.push(`${f}: missing closed/open variant arrays`);
            // A pack is CID-able JSON: host paths / URLs inside it break the moment
            // it is served from a different host (chain boot). No prose fields exist
            // in a pack, so a whole-file scan is safe here (unlike blocks/levels).
            const text = fs.readFileSync(p, 'utf8');
            if (/\/assets\//.test(text)) errs.push(`${f}: host-relative /assets/ path inside a pack — register the asset in demo.manifest.json and reference its numeric id`);
            if (/https?:/.test(text)) errs.push(`${f}: URL inside a pack — packs must stay content-addressable`);
            // Part props are the raw tail [slot3, repeat, anim, stop, slot7]: same
            // slot rules as the emitted rows (Expander appends them verbatim).
            for (const variant of [...(pack.closed ?? []), ...(pack.open ?? [])]) {
                for (const [pi, part] of (variant.parts ?? []).entries()) {
                    const at = `${f}:${variant.key}.parts[${pi}]`;
                    const props = part.props ?? [];
                    checkRow(part.type, [[0, 0, 0], [0, 0, 0], [0, 0, 0], ...props], at, errs);
                }
            }
            expect(errs).toEqual([]);
        });
    }
});

// ─── the gate bites: negative fixtures ───────────────────────────────────────
//
// Reproductions of the 2026-07-21 violation class, fed straight to the checker.
// If a refactor ever makes these pass, the gate has gone vacuous — fix the
// checker, not the fixtures.

describe('content gate — rejects the known violation shapes', () => {
    const errsOf = (typeId: number, row: any[]) => {
        const errs: Err[] = [];
        checkRow(typeId, row, 'fixture', errs);
        return errs;
    };

    it('a1 wall with a texture path in slot 3', () => {
        expect(errsOf(0xa1, [[1, 1, 1], [0, 0, 0], [0, 0, 0], '/assets/spanish-wall.png', [1, 1], 0, 1])).not.toEqual([]);
    });

    it('a2 box with a host path in the slot-7 texture', () => {
        expect(errsOf(0xa2, [[1, 1, 1], [0, 0, 0], [0, 0, 0], 0, [1, 1], 0, 1, '/assets/x.png'])).not.toEqual([]);
    });

    it('a4 module with a host-relative resource', () => {
        expect(errsOf(0xa4, [[1, 1, 1], [0, 0, 0], [0, 0, 0], '/assets/x.glb', 0, 0])).not.toEqual([]);
    });

    it('b6 spp with a URL where the theme ref belongs', () => {
        expect(errsOf(0xb6, [[0, 0, 0], [], 'https://cdn/pack.json'])).not.toEqual([]);
    });

    it('trigger node with an unknown action type', () => {
        expect(errsOf(0xb8, [[1, 1, 1], [0, 0, 0], [0, 0, 0], 1, 0, [{ type: 'in', actions: [{ type: 'teleport' }] }]])).not.toEqual([]);
    });

    it('still admits the sanctioned forms (id / <cid>.<ext> / scheme URL)', () => {
        expect(errsOf(0xa2, [[1, 1, 1], [0, 0, 0], [0, 0, 0], 0, [1, 1], 0, 1, 43])).toEqual([]);
        expect(errsOf(0xa2, [[1, 1, 1], [0, 0, 0], [0, 0, 0], 0, [1, 1], 0, 1,
            'bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy.png'])).toEqual([]);
        expect(errsOf(0xa4, [[1, 1, 1], [0, 0, 0], [0, 0, 0], 'https://example.com/m.glb', 0, 0])).toEqual([]);
    });
});

// ─── manifest + cross-file reference integrity ───────────────────────────────

describe('content gate — resource catalog (demo.manifest.json)', () => {
    const manifest = readJson(path.join(CONTENT, 'assets', 'demo.manifest.json'));
    const MANIFEST_TYPES = new Set(['texture', 'module', 'avatar', 'audio', 'video']);

    it('catalog entries are well-formed with unique ids', () => {
        const errs: Err[] = [];
        const seen = new Set<number>();
        for (const [i, e] of manifest.entries()) {
            const at = `manifest[${i}]`;
            if (typeof e.id !== 'number') errs.push(`${at}: numeric id required`);
            else if (seen.has(e.id)) errs.push(`${at}: duplicate id ${e.id}`);
            else seen.add(e.id);
            if (!MANIFEST_TYPES.has(e.type)) errs.push(`${at}: unknown type ${JSON.stringify(e.type)}`);
            if (typeof e.format !== 'string' || !e.format) errs.push(`${at}: format required`);
            if (typeof e.path !== 'string' || !e.path.startsWith('/assets/')) errs.push(`${at}: path must live under /assets/ (the CAS ingest dir)`);
            if (e.size != null && (!Array.isArray(e.size) || e.size.length !== 2 || !e.size.every((n: any) => typeof n === 'number' && n > 0))) {
                errs.push(`${at}: size must be [w>0, h>0] metres (texture.md §3)`);
            }
        }
        expect(errs).toEqual([]);
    });

    it('every id referenced from content exists in the catalog with the right type', () => {
        // The walkers above (blocks/levels/stylepacks) filled the used-id pools;
        // vitest runs describes in file order, so the pools are complete here.
        const byId = new Map<number, any>(manifest.map((e: any) => [e.id, e]));
        const errs: Err[] = [];
        for (const id of usedTextureIds) {
            if (byId.get(id)?.type !== 'texture') errs.push(`texture id ${id} referenced but not a texture catalog entry`);
        }
        for (const id of usedModuleIds) {
            if (byId.get(id)?.type !== 'module') errs.push(`module id ${id} referenced but not a module catalog entry`);
        }
        for (const id of usedAudioIds) {
            if (byId.get(id)?.type !== 'audio') errs.push(`audio id ${id} referenced but not an audio catalog entry`);
        }
        const worldTex = readJson(path.join(CONTENT, 'worlds', 'default.world.json'))?.block?.texture;
        if (typeof worldTex === 'number' && byId.get(worldTex)?.type !== 'texture') {
            errs.push(`world block.texture ${worldTex} missing from the catalog`);
        }
        expect(errs).toEqual([]);
    });
});
