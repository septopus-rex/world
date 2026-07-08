// canonical.mjs — TS/JS 侧 canonical 状态哈希,逐字节镜像 Rust
// reference/crates/septopus-conformance/src/hash.rs + septopus-protocol/src/lib.rs。
// 规范:docs/plan/specs/bevy-reference-engine.md §4。零 npm 依赖(node 内置 crypto)。
//
// 用法(block vector):
//   node canonical.mjs emit  <vector.json>    # 打印 name + 实算哈希
//   node canonical.mjs write <vector.json>    # 把实算哈希写回 expect.stateHash
// 编程接口:
//   import { canonicalHash, hashExpandedRows } from './canonical.mjs'
//     canonicalHash(blockRaw, coord)          // block vector(解码 5 槽块)
//     hashExpandedRows(coord, rows)           // spp/motif 展开输出 [[typeId,row],…]
//
// B0/B1 范围:5 槽块 + 标准 7 槽几何族(a1/a2/a5/a6/a7),steps=0。与 Rust 同步扩展。

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const WALL = 0x00a1, BOX = 0x00a2, WATER = 0x00a5, CONE = 0x00a6, BALL = 0x00a7, TRIGGER = 0x00b8;
const STANDARD_7 = new Set([WALL, BOX, WATER, CONE, BALL]);
const QUANT = 10000;

const q = (v) => BigInt(Math.round((Number(v) || 0) * QUANT));   // 定点量化 → i64
const truthy = (v) => !!v;                                        // 与 Rust is_truthy 对齐
const arr3 = (v, d) => (Array.isArray(v) && v.length >= 3)
    ? [Number(v[0]) || d[0], Number(v[1]) || d[1], Number(v[2]) || d[2]] : d;

/** 触发器事件结构签名(镜像 Rust trigger_event_sig):`type:actType.method,…;…`。 */
function triggerEventSig(events) {
    if (!Array.isArray(events)) return '';
    return events.map((node) => {
        const ty = node?.type ?? '';
        const acts = Array.isArray(node?.actions) ? node.actions : [];
        return `${ty}:${acts.map((a) => `${a?.type ?? ''}.${a?.method ?? ''}`).join(',')}`;
    }).join(';');
}

/** 一行 → canonical 实体(镜像 decode_row):标准 7 槽 + b8 触发器(带事件签名 tail)。 */
function entityFromRow(typeId, row, seq) {
    if (!Array.isArray(row)) return null;
    const size = arr3(row[0], [1, 1, 1]);
    const pos = arr3(row[1], [0, 0, 0]);
    const rot = arr3(row[2], [0, 0, 0]);
    let resource, solid, tail;
    if (STANDARD_7.has(typeId)) {
        resource = BigInt(Math.trunc(Number(row[3] ?? 0)));
        solid = typeId === BOX || truthy(row[6]);
        tail = Buffer.alloc(0);
    } else if (typeId === TRIGGER) {
        const shape = Math.trunc(Number(row[3] ?? 1));
        const gameOnly = Math.trunc(Number(row[4] ?? 0));
        resource = 0n; solid = false;
        tail = Buffer.from(`shape=${shape}|game=${gameOnly}|ev=${triggerEventSig(row[5])}`, 'utf8');
    } else {
        return null; // 未建模类型
    }
    return {
        typeId, derivedFrom: '',
        pos: pos.map(q), rot: rot.map(q), size: size.map(q),
        resource, solid, tail, seq,
    };
}

/** 解 5 槽块 raw → canonical 实体列表(镜像 decode_block:authoring 序按所有行推进)。 */
function decodeBlock(raw) {
    const arr = Array.isArray(raw) ? raw : [];
    const elevation = q(arr[0] ?? 0);
    const game = BigInt(Math.trunc(Number(arr[4] ?? 0)));
    const entities = [];
    let seq = 0;
    for (const g of (Array.isArray(arr[2]) ? arr[2] : [])) {
        if (!Array.isArray(g)) continue;
        const typeId = Number(g[0]) >>> 0;
        for (const row of (Array.isArray(g[1]) ? g[1] : [])) {
            const e = entityFromRow(typeId, row, seq++);
            if (e) entities.push(e);
        }
    }
    return { elevation, game, entities };
}

const i64 = (x) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(x)); return b; };
const u32 = (x) => { const b = Buffer.alloc(4); b.writeUInt32LE(x >>> 0); return b; };

function cmpEnt(a, b) {
    if (a.derivedFrom !== b.derivedFrom) return a.derivedFrom < b.derivedFrom ? -1 : 1;
    if (a.typeId !== b.typeId) return a.typeId - b.typeId;
    for (let i = 0; i < 3; i++) if (a.pos[i] !== b.pos[i]) return a.pos[i] < b.pos[i] ? -1 : 1;
    return a.seq - b.seq;
}

/** 核心:块头 + 实体列表 → `sha256:<hex>`(逐字节镜像 hash.rs)。 */
function hashState(coord, elevation, game, entities) {
    const ents = entities.slice().sort(cmpEnt);
    const parts = [];
    parts.push(i64(BigInt(coord[0] | 0)), i64(BigInt(coord[1] | 0)), i64(elevation), i64(game));
    parts.push(u32(0));                       // flags 数(B0/B1: 0)
    parts.push(u32(ents.length));
    for (const e of ents) {
        parts.push(u32(e.typeId));
        const df = Buffer.from(e.derivedFrom, 'utf8');
        parts.push(u32(df.length), df);
        for (const v of e.pos) parts.push(i64(v));
        for (const v of e.rot) parts.push(i64(v));
        for (const v of e.size) parts.push(i64(v));
        parts.push(i64(e.resource));
        parts.push(Buffer.from([e.solid ? 1 : 0]));
        parts.push(u32(e.tail.length), e.tail);
    }
    return 'sha256:' + createHash('sha256').update(Buffer.concat(parts)).digest('hex');
}

/** block vector:解 5 槽块 → 状态哈希。 */
export function canonicalHash(raw, coord) {
    const st = decodeBlock(raw);
    return hashState(coord, st.elevation, st.game, st.entities);
}

/** spp/motif 展开输出 `[[typeId,row],…]` → 状态哈希(elevation/game=0,derivedFrom='')。 */
export function hashExpandedRows(coord, rows) {
    const entities = [];
    rows.forEach(([typeId, row], i) => {
        const e = entityFromRow(Number(typeId) >>> 0, row, i);
        if (e) entities.push(e);
    });
    return hashState(coord, 0n, 0n, entities);
}

// ── CLI(仅 block vector;spp vector 由 vitest 用真引擎 expandSpp 生成) ──────────
const [, , cmd, file] = process.argv;
if (cmd === 'emit' || cmd === 'write') {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    const coord = doc.input?.coord ?? [0, 0];
    const h = canonicalHash(doc.input?.raw ?? [], coord);
    if (cmd === 'emit') {
        console.log(`${doc.name}  ${h}`);
    } else {
        doc.expect = { ...(doc.expect ?? {}), stateHash: h };
        writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
        console.log(`wrote ${doc.name}  ${h}`);
    }
}
