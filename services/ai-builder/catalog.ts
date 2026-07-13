/**
 * Adjunct + block-schema catalog (spec docs/plan/specs/ai-builder.md §2) —
 * the machine-readable half of the LLM's "textbook", served at /v0/catalog.
 * The human-readable half (the actual prompt text, with worked examples) is
 * hand-authored in prompts.ts, same division of labour as ai-gateway v1.
 *
 * `emittable` stays pinned to GEN_ADJUNCT_WHITELIST (the same 12 types v1
 * allows) even though this service describes ALL built-in types — the wider
 * table exists so the LLM can make sense of `existing` content that includes
 * non-whitelisted types (a module/track already in the block), not to widen
 * what it's allowed to generate. Raw per-cell/spline/module authoring is a
 * known high bar for LLMs (docs/plan/specs/spp-recursive-refinement.md) —
 * collision-checking doesn't remove that problem, so it doesn't earn those
 * types a seat on the emit list.
 */
import { AdjunctType } from '../../engine/src/core/types/AdjunctType';
import { GEN_ADJUNCT_WHITELIST } from '../../engine/src/core/protocol/GenerationDoc';
import { COLLIDABLE_TYPES } from './collision';

export interface AdjunctCatalogEntry {
    typeId: number;
    name: string;
    oneLiner: string;
    rawShape: string;
    collidable: boolean;
    emittable: boolean;
}

const DESCRIPTIONS: Record<number, { oneLiner: string; rawShape: string }> = {
    [AdjunctType.Wall]: { oneLiner: '实心墙体/隔断,占地', rawShape: '[size[E,N,H],pos[x,y,z],rot[rx,ry,rz],调色板0/1/2/3/10,repeat,animate?,stop?]' },
    [AdjunctType.Box]: { oneLiner: '实心方块(台/箱/装饰通用),占地', rawShape: '同 Wall' },
    [AdjunctType.Light]: { oneLiner: '点/聚光/平行光,不占地', rawShape: '[类型0点1聚2平行,pos,rot,颜色十进制,强度,距离,角度,阴影0/1]' },
    [AdjunctType.Module]: { oneLiner: '外部 3D 模型引用 — 不可直出(需先注册资源 id)', rawShape: '—' },
    [AdjunctType.Water]: { oneLiner: '半透明水面,不占地(可通过)', rawShape: '同 Wall' },
    [AdjunctType.Cone]: { oneLiner: '实心圆锥装饰体,占地(可当树冠/路标用)', rawShape: '同 Wall' },
    [AdjunctType.Ball]: { oneLiner: '实心球体装饰体,占地', rawShape: '同 Wall' },
    [AdjunctType.Sign]: { oneLiner: '不受光贴图平面(标牌/装饰画)— 不可直出', rawShape: '—' },
    [AdjunctType.Stop]: { oneLiner: '隐形碰撞体(box/ball/slope),占地', rawShape: '[size,pos,rot,mode(1),animate?,shape 1box/2ball/3slope]' },
    [AdjunctType.Item]: { oneLiner: '可拾取物品,不占地', rawShape: '[pos,模板id,种子,数量,rot]' },
    [AdjunctType.Spp]: { oneLiner: '弦粒子源(展开派生实体)— 不可直出', rawShape: '—' },
    [AdjunctType.Trigger]: { oneLiner: '触发体积(in/out/hold/touch→动作),不占地', rawShape: '[size,pos,rot,mode,animate,events[],anchor?]' },
    [AdjunctType.Spawner]: { oneLiner: '定时生成器,不占地', rawShape: '[pos,[模板typeId,模板row],间隔秒,上限,...]' },
    [AdjunctType.Npc]: { oneLiner: '自主 NPC(会移动)— 不做静态碰撞检测', rawShape: '[pos,visual,behavior,hp?,interact?,dialogue?]' },
    [AdjunctType.Track]: { oneLiner: '管道/轨道样条 — 不可直出', rawShape: '—' },
    [AdjunctType.Motif]: { oneLiner: '生成式内容(house/road/building/…展开为标准 adjunct)', rawShape: '[origin,模板名,种子,params?]' },
    [AdjunctType.Link]: { oneLiner: '可点击链接面板,不占地', rawShape: '[size,pos,rot,资源,repeat,null,null,url]' },
    [AdjunctType.Audio]: { oneLiner: '空间音频源 — 不可直出(需先注册音频资源)', rawShape: '—' },
    [AdjunctType.Video]: { oneLiner: '视频屏幕 — 不可直出(需先注册视频资源)', rawShape: '—' },
    [AdjunctType.Book]: { oneLiner: '可翻页文字面板 — 不可直出', rawShape: '—' },
    [AdjunctType.Board]: { oneLiner: '留言板(服务器可变状态)— 不可直出', rawShape: '—' },
};

export function buildAdjunctCatalog(): AdjunctCatalogEntry[] {
    const seen = new Set<number>();
    const out: AdjunctCatalogEntry[] = [];
    for (const [name, typeId] of Object.entries(AdjunctType)) {
        if (seen.has(typeId)) continue; // skip the deprecated Particle alias of Spp
        seen.add(typeId);
        const d = DESCRIPTIONS[typeId];
        out.push({
            typeId,
            name,
            oneLiner: d?.oneLiner ?? '',
            rawShape: d?.rawShape ?? '',
            collidable: COLLIDABLE_TYPES.has(typeId),
            emittable: GEN_ADJUNCT_WHITELIST.has(typeId),
        });
    }
    return out.sort((a, b) => a.typeId - b.typeId);
}

export const BLOCK_SCHEMA_TEXT =
    '一个 block 是 16×16 米地块,原点在西南角。X 向东(0..16),Y 向北(0..16),Z 向上(米),' +
    '地面 z=0。物体的 pos 是几何中心(不是底部)。旋转 [rx,ry,rz] 为弧度,竖直朝向(yaw)在 ' +
    'index 1。block raw 五元组 = [elevation, status, adjuncts, animations, game],adjuncts = ' +
    '[[typeId, [row,row,…]], …] 按 typeId 分组。';
