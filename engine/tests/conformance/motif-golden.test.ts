import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expandMotif } from '../../src/core/motif/MotifExpander';
// @ts-expect-error — canonical.mjs is plain JS (逐字节镜像 Rust 侧哈希),无类型
import { hashExpandedRows } from './canonical.mjs';

// motif(c2)展开的 golden 对拍(TS = 真引擎 expandMotif;Rust = clean-room expand_motif)。
// 与 spp-golden 同构。GEN=1 生成期望哈希;否则断言。

const GOLDEN = fileURLToPath(new URL('../golden', import.meta.url));
const GEN = !!process.env.GEN;

const vectors = readdirSync(GOLDEN)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: `${GOLDEN}/${f}`, doc: JSON.parse(readFileSync(`${GOLDEN}/${f}`, 'utf8')) }))
    .filter((v) => v.doc?.input?.kind === 'motif');

describe('motif expansion golden — real engine expandMotif', () => {
    for (const { file, doc } of vectors) {
        it(doc.name, () => {
            const coord = doc.input.coord ?? [0, 0];
            const rows = expandMotif(doc.input.raw as any);
            const h = hashExpandedRows(coord, rows);
            if (GEN) {
                doc.expect = { ...(doc.expect ?? {}), stateHash: h };
                writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
                // eslint-disable-next-line no-console
                console.log(`wrote ${doc.name}  ${h}  (${rows.length} rows)`);
            } else {
                expect(h).toBe(doc.expect?.stateHash);
            }
        });
    }
});
