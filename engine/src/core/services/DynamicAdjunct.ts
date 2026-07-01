import { AdjunctDefinition, RenderObject, STDObject, MeshType } from '../types/Adjunct';
import { standardAttribute, standardMenu } from '../../plugins/adjunct/_shared';
import { AdjunctError } from '../errors';

/**
 * DynamicAdjunct — the DECLARATIVE v1 of dynamically-loaded adjuncts.
 *
 * A dynamic adjunct ships as sandboxed JS (loaded from IPFS/chain or injected
 * locally; see AdjunctLoader + AdjunctSandbox). That code runs in a Web Worker
 * and produces a plain-data DESCRIPTOR — NOT live functions. Functions cannot
 * cross the Worker postMessage boundary (structured clone), and the engine's
 * deserialize / stdToRenderData run synchronously on the block-init path, so a
 * per-call RPC into the worker is a non-starter for v1. The descriptor sidesteps
 * both: it is cloneable, and `descriptorToDefinition` turns it into a real,
 * fully-synchronous AdjunctDefinition the engine consumes exactly like a built-in.
 *
 * Scope (v1 = declarative): the descriptor names a raw LAYOUT (reused from the
 * standard primitives) and one or more render PARTS (mesh + material). The engine
 * builds the meshes via MeshFactory — dynamic code never touches Three.js, which
 * keeps the render-layer boundary intact. Imperative transforms (arbitrary JS
 * building geometry) are a future RPC-based v2, deliberately out of scope here.
 */

/** One renderable part of a dynamic adjunct. Becomes a single RenderObject. */
export interface DescriptorPart {
    /** MeshFactory primitive: box | sphere | cylinder | cone | plane | tube. */
    mesh: MeshType;
    /** Material colour (hex). Falls back to the instance's std material colour. */
    color?: number;
    /** Fixed size [E, N, Alt]; default = the instance's std size (raw[0]). */
    size?: [number, number, number];
    /** Local offset [E, N, Alt] added to the instance position (e.g. stack parts). */
    offset?: [number, number, number];
    /** Tube control points (mesh: 'tube'), object-local engine space. */
    path?: [number, number, number][];
    /** Close the swept tube into a loop. */
    closed?: boolean;
}

export interface AdjunctDescriptor {
    meta: {
        /** On-chain-style type-id this adjunct registers as (e.g. 0xf001). */
        typeId: number;
        name: string;
        short?: string;
        desc?: string;
        version?: string;
    };
    /** Raw instance layout. v1 supports only 'standard':
     *  [size3, pos3, rot3, resource, repeat, animate, stop]. */
    layout?: 'standard';
    /** One part, or an array of parts assembled into one adjunct. */
    render: DescriptorPart | DescriptorPart[];
}

const MESH_TYPES: ReadonlySet<string> = new Set(['box', 'sphere', 'cylinder', 'cone', 'plane', 'tube', 'module']);

function num(n: any): n is number { return typeof n === 'number' && Number.isFinite(n); }

/** Throws a precise error if `desc` is not a well-formed descriptor. The error
 *  surfaces to whoever injected the code (loader → Engine.loadDynamicAdjunct). */
export function validateDescriptor(desc: any): asserts desc is AdjunctDescriptor {
    if (!desc || typeof desc !== 'object') {
        throw new AdjunctError('[DynamicAdjunct] descriptor missing — dynamic code must assign `hooks = { meta, render }`', { code: 'ADJUNCT_DESCRIPTOR' });
    }
    if (typeof desc.deserialize === 'function' || typeof desc.transform === 'function'
        || (desc.transform && typeof desc.transform.stdToRenderData === 'function')) {
        throw new AdjunctError('[DynamicAdjunct] function-style hooks are not supported in v1 (declarative only) — return a plain { meta, render } descriptor', { code: 'ADJUNCT_DESCRIPTOR' });
    }
    if (!desc.meta || !num(desc.meta.typeId)) {
        throw new AdjunctError('[DynamicAdjunct] descriptor.meta.typeId must be a number', { code: 'ADJUNCT_DESCRIPTOR' });
    }
    if (desc.layout !== undefined && desc.layout !== 'standard') {
        throw new AdjunctError(`[DynamicAdjunct] unsupported layout '${desc.layout}' (v1 supports 'standard' only)`, { code: 'ADJUNCT_DESCRIPTOR' });
    }
    const parts = Array.isArray(desc.render) ? desc.render : [desc.render];
    if (parts.length === 0) throw new AdjunctError('[DynamicAdjunct] descriptor.render must define at least one part', { code: 'ADJUNCT_DESCRIPTOR' });
    for (const p of parts) {
        if (!p || !MESH_TYPES.has(p.mesh)) {
            throw new AdjunctError(`[DynamicAdjunct] each render part needs a valid mesh (${[...MESH_TYPES].join('/')}), got '${p?.mesh}'`, { code: 'ADJUNCT_DESCRIPTOR' });
        }
    }
}

/**
 * Compile a validated descriptor into an AdjunctDefinition. The result is
 * indistinguishable from a built-in to BlockSystem / AdjunctSystem: it owns a
 * synchronous attribute (standard raw<->STD) + a stdToRenderData that emits one
 * RenderObject per part, and the standard edit menu so dynamic adjuncts are
 * selectable/editable too.
 */
export function descriptorToDefinition(descriptor: any): AdjunctDefinition {
    validateDescriptor(descriptor);
    const parts: DescriptorPart[] = Array.isArray(descriptor.render) ? descriptor.render : [descriptor.render];
    const meta = descriptor.meta;

    const reg = () => ({
        name: meta.name ?? `dyn_${meta.typeId.toString(16)}`,
        short: meta.short ?? 'DYN',
        typeId: meta.typeId,
        desc: meta.desc ?? 'dynamically-loaded declarative adjunct',
        version: meta.version ?? '1.0.0',
    });

    return {
        hooks: {
            reg,
            init: () => ({ chain: '', value: null }),
        },
        attribute: standardAttribute,
        menu: standardMenu as any,
        transform: {
            stdToRenderData: (stds: STDObject[], elevation: number): RenderObject[] => {
                const out: RenderObject[] = [];
                stds.forEach((std, i) => {
                    parts.forEach((part, pi) => {
                        const off = part.offset ?? [0, 0, 0];
                        out.push({
                            type: part.mesh,
                            index: i * parts.length + pi,
                            params: {
                                size: part.size ?? [std.x, std.y, std.z],
                                position: [std.ox + off[0], std.oy + off[1], std.oz + off[2] + elevation],
                                rotation: [std.rx, std.ry, std.rz],
                                ...(part.path ? { path: part.path } : {}),
                                ...(part.closed !== undefined ? { closed: part.closed } : {}),
                            },
                            material: {
                                ...(std.material ?? {}),
                                ...(num(part.color) ? { color: part.color } : {}),
                            },
                            stop: std.stop,
                            animate: std.animate,
                        });
                    });
                });
                return out;
            },
        },
    };
}
