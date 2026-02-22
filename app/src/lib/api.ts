/**
 * 模拟一个区块的数据结构（简化版 SPP Block JSON）
 */
export interface MockBlockData {
    x: number;
    y: number;
    worldId: string;
    adjuncts: any[]; // 存放该地块内的附属物 SPP JSON
}

/**
 * 动态模拟获取一个真实世界的空白区块数据 (假设区块标准长宽为 20x20)
 * 目前该空地块只包含一个地基 (ground)，代表地块已被探索并加载
 */
export function generateEmptyBlockData(bx: number, by: number, worldId: string = "main"): MockBlockData {
    const adjuncts = [];

    // 每个区块中心固定放一个地基 (尺寸 20x0.5x20)
    // 利用棋盘格交错颜色来帮助玩家在纯3D视角下肉眼分辨出地块边界
    const isDark = (Math.abs(bx) + Math.abs(by)) % 2 === 0;
    adjuncts.push({
        id: `ground_${bx}_${by}`,
        type: "box",
        params: {
            size: [20, 0.5, 20],
            position: [0, -0.25, 0], // 在 y=0 的下方，作为地基
            rotation: [0, 0, 0]
        },
        material: {
            color: isDark ? 0x223322 : 0x2a3d2a
        }
    });

    return {
        x: bx,
        y: by,
        worldId,
        adjuncts
    };
}

/**
 * 模拟从链上获取指定 [x,y,world] 的独立地块数据
 * 附带 200ms 的网络模拟延迟
 */
export async function fetchEmptyBlock(x: number, y: number, worldId: string = "main"): Promise<MockBlockData> {
    return new Promise((resolve) => {
        // 模拟真实区块拉取延迟
        setTimeout(() => {
            resolve(generateEmptyBlockData(x, y, worldId));
        }, 200);
    });
}
