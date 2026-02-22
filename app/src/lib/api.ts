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
    // SPP Protocol Focus: A block starts as an empty container.
    // Sandbox specific: We can return an empty array here as the Loader will provide the default skeleton ground.
    const adjuncts: any[] = [];

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
