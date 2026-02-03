# 坐标系统

## 概述

Septopus World采用语义化的坐标系统，将现实世界的地理概念映射到3D空间。

## 坐标系统对比

```javascript
// Septopus世界坐标系
Septopus: {
    X: 东西方向（+东，-西）
    Y: 南北方向（+北，-南）
    Z: 高度方向（+向上，-向下）
    单位：米（meter）
    原点：西南角Block[1,1]的中心点
}

// Three.js坐标系
Three.js: {
    X: 水平右方向
    Y: 垂直向上方向
    Z: 水平向前方向
    单位：无单位
    原点：3D空间原点
}

// 转换关系
Septopus → Three.js: [X_septopus, Z_septopus, -Y_septopus]
Three.js → Septopus: [X_three, -Z_three, Y_three]
```

## Block坐标系统

### 1. Block定位
```javascript
const block_coord = {
    x: integer,  // Block X坐标，范围[1, 4096]
    y: integer,  // Block Y坐标，范围[1, 4096]
    world: integer, // 世界索引
    key: `${x}_${y}`  // 唯一标识符
}

// 示例
const block = { x: 2025, y: 619, world: 0, key: "2025_619" };
```

### 2. Block尺寸
```javascript
const block_size = {
    width: 16,      // Block宽度（米）
    length: 16,      // Block长度（米）
    side: 16000,     // Block边长（毫米，转换系数1000）
    accuracy: 1000,   // 坐标转换系数（米→毫米）
}
```

### 3. Block边界
```javascript
// Block世界边界
const world_limit = [4096, 4096];

// Block内部坐标系
const block_internal = {
    origin: [0, 0],        // Block内坐标原点（米）
    center: [8, 8],        // Block中心点（米）
    corners: [             // Block四个角点
        [0, 0],            // 西南角
        [16, 0],           // 东南角
        [0, 16],           // 西北角
        [16, 16]           // 东北角
    ]
}
```

## 世界坐标计算

### 1. Block到世界坐标
```javascript
const blockToWorld = (blockX, blockY) => {
    const side = block_size.side;
    return {
        x: (blockX - 1) * side,
        y: (blockY - 1) * side
    };
}

// 示例
const world_pos = blockToWorld(2025, 619);
// { x: 323840000, y: 9896000 }  // 毫米
```

### 2. 世界到Block坐标
```javascript
const worldToBlock = (worldX, worldY) => {
    const side = block_size.side;
    const accuracy = block_size.accuracy;

    return {
        blockX: Math.floor(worldX / side) + 1,
        blockY: Math.floor(worldY / side) + 1,
        insideX: (worldX % side) / accuracy,
        insideY: (worldY % side) / accuracy,
    };
}

// 示例
const block_pos = worldToBlock(32400000, 9900000);
// { blockX: 2026, blockY: 620, insideX: 0.0, insideY: 0.0 }
```

### 3. Block内相对坐标
```javascript
const blockRelative = (absX, absY) => {
    const side = block_size.side;
    const accuracy = block_size.accuracy;

    return {
        x: absX * accuracy,
        y: absY * accuracy
    };
}

// 示例
const rel_pos = blockRelative(8.5, 3.2);
// { x: 8.5, y: 3.2 }
```

## 坐标转换函数

### 1. Septopus → Three.js转换
```javascript
// 基础转换函数
const septopusToThree = (arr) => {
    return [arr[0], arr[2], -arr[1]];
}

// Block内坐标转换
const insideToThree = (x, y, z, blockX, blockY) => {
    const side = block_size.side;
    const accuracy = block_size.accuracy;

    const worldX = (blockX - 1) * side + x * accuracy;
    const worldY = (blockY - 1) * side + y * accuracy;
    const worldZ = z * accuracy;

    return [worldX, worldZ, -worldY];
}
```

### 2. Three.js → Septopus转换
```javascript
const threeToSeptopus = (x, y, z) => {
    return [x, -z, y];
}

// 世界坐标到Septopus坐标
const threeToWorld = (threeX, threeY, threeZ) => {
    return {
        septopusX: threeX,
        septopusY: -threeZ,
        septopusZ: threeY
    };
}
```

## 玩家坐标计算

### 1. 玩家位置数据结构
```javascript
const player_location = {
    block: [x, y],              // 当前Block坐标
    position: [x, y, z],       // 相对位置（米）
    rotation: [x, y, z],       // 朝向（弧度）
    world: 0,                 // 世界索引
    extend: 2,                 // 加载扩展范围
    stop: {
        on: false,             // 是否站在阻拦体上
        adjunct: "",           // 阻拦体名称
        index: 0                // 阻拦体索引
    }
}
```

### 2. 绝对位置计算
```javascript
const getAbsolutePosition = (blockX, blockY, posX, posY, posZ) => {
    const side = block_size.side;
    const accuracy = block_size.accuracy;

    // 世界坐标（毫米）
    const worldX = (blockX - 1) * side + posX * accuracy;
    const worldY = (blockY - 1) * side + posY * accuracy;
    const worldZ = posZ * accuracy;

    return {
        x: worldX / accuracy,
        y: worldY / accuracy,
        z: worldZ / accuracy
    };
}

// 示例
const abs_pos = getAbsolutePosition(2025, 619, 8.5, 3.2, 1.7);
// { x: 2028.5, y: 622.2, z: 1.7 }  // 米
```

### 3. 摄像机位置计算
```javascript
const getCameraPosition = (playerLoc, dom_id) => {
    const side = block_size.side;
    const accuracy = block_size.accuracy;

    const { block, position, rotation } = playerLoc;
    const camera = VBW.cache.get(["active", "containers", dom_id, "camera"]);

    // Septopus → Three.js转换
    const pos = [
        camera.position.x + position[0] * accuracy,
        camera.position.z - position[1] * accuracy,
        camera.position.y + position[2] * accuracy
    ];

    camera.position.set(pos[0], pos[1], pos[2]);

    // 旋转：Z转X, X转Z, Y保持
    camera.rotation.set(
        rotation[0],
        -rotation[2],
        rotation[1]
    );

    return pos;
}
```

## 附属物坐标

### 1. 附属物位置定义
```javascript
const adjunct_position = {
    x: number,       // 尺寸X（米）
    y: number,       // 尺寸Y（米）
    z: number,       // 尺寸Z（米）
    ox: number,      // 偏移X（米）
    oy: number,      // 偏移Y（米）
    oz: number,      // 偏移Z（米）
    rx: number,      // 旋转X（弧度）
    ry: number,      // 旋转Y（弧度）
    rz: number,      // 旋转Z（弧度）
}
```

### 2. 附属物世界坐标
```javascript
const adjunctToWorld = (blockX, blockY, adjunct) => {
    const { ox, oy, oz, x, y, z } = adjunct;
    const side = block_size.side;
    const accuracy = block_size.accuracy;

    const worldX = (blockX - 1) * side + ox * accuracy;
    const worldY = (blockY - 1) * side + oy * accuracy;
    const worldZ = oz * accuracy;

    return {
        position: [worldX, worldY, worldZ],
        size: [x * accuracy, y * accuracy, z * accuracy],
        rotation: [rx, ry, rz]
    };
}

// 示例
const world_adj = adjunctToWorld(2025, 619, {
    x: 4, y: 3, z: 2,
    ox: 8, oy: 6, oz: 1,
    rx: 0, ry: 0, rz: 0
});
```

## 射线检测坐标

### 1. 射线投射
```javascript
// 鼠标屏幕坐标
const mouse = {
    x: clientX,
    y: clientY
};

// 转换到NDC（归一化设备坐标）
const ndc = {
    x: (mouse.x / width) * 2 - 1,
    y: -(mouse.y / height) * 2 + 1
};

// 从摄像机投射射线
raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
```

### 2. 交点坐标处理
```javascript
const intersectObjects = (intersects) => {
    const results = [];

    for (const hit of intersects) {
        if (!hit.object || !hit.object.userData) continue;

        const userData = hit.object.userData;

        // 过滤其他Block的对象
        if (userData.x !== blockX || userData.y !== blockY) {
            continue;
        }

        // 过滤辅助对象
        if (userData.name.includes("_")) {
            continue;
        }

        results.push({
            object: hit.object,
            distance: hit.distance,
            point: hit.point,
            normal: hit.face.normal,
            userData: userData
        });
    }

    // 按距离排序
    results.sort((a, b) => a.distance - b.distance);
    return results;
}
```

## 距离计算

### 1. 两点距离
```javascript
const distance = (x1, y1, z1, x2, y2, z2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// 平面距离
const distance2D = (x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

// Block距离
const blockDistance = (blockX1, blockY1, blockX2, blockY2) => {
    const side = block_size.side;
    const dx = (blockX2 - blockX1) * side;
    const dy = (blockY2 - blockY1) * side;
    return Math.sqrt(dx * dx + dy * dy);
}
```

### 2. 角度计算
```javascript
// 计算从点1到点2的角度
const angleTo = (x1, y1, x2, y2) => {
    return Math.atan2(y2 - y1, x2 - x1);
}

// 计算两点间的方位角
const bearing = (x1, y1, x2, y2) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const degrees = angle * (180 / Math.PI);
    return (degrees + 360) % 360;
}

// 计算从角度1到角度2的差值
const angleDiff = (angle1, angle2) => {
    const diff = angle2 - angle1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
}
```

## 边界检测

### 1. Block边界检测
```javascript
const checkBlockBounds = (blockX, blockY) => {
    const limit = world_limit;

    return {
        inBounds: blockX >= 1 && blockX <= limit[0] &&
                   blockY >= 1 && blockY <= limit[1],
        onEdge: (blockX === 1 || blockX === limit[0]) ||
                 (blockY === 1 || blockY === limit[1])
    };
}
```

### 2. Block内边界检测
```javascript
const checkInternalBounds = (x, y) => {
    return {
        inside: x >= 0 && x <= 16 && y >= 0 && y <= 16,
        onEdge: (x === 0 || x === 16) || (y === 0 || y === 16)
    };
}
```

## 坐标辅助函数

### 1. 坐标验证
```javascript
const validateBlockCoord = (x, y) => {
    const limit = world_limit;

    if (!Number.isInteger(x) || !Number.isInteger(y)) {
        return { valid: false, error: "Coordinates must be integers" };
    }

    if (x < 1 || x > limit[0] || y < 1 || y > limit[1]) {
        return { valid: false, error: "Coordinates out of world bounds" };
    }

    return { valid: true };
}
```

### 2. 坐标格式化
```javascript
const formatCoord = (x, y, z) => {
    return {
        x: x.toFixed(3),
        y: y.toFixed(3),
        z: z.toFixed(3)
    };
}

const formatBlockCoord = (blockX, blockY) => {
    return `[${blockX}, ${blockY}]`;
}
```

## 渲染坐标

### 1. 渲染坐标计算
```javascript
const getRenderPosition = (blockX, blockY, insideX, insideY, elevation) => {
    const side = block_size.side;
    const accuracy = block_size.accuracy;

    // 世界坐标
    const worldX = (blockX - 1) * side + insideX * accuracy;
    const worldY = (blockY - 1) * side + insideY * accuracy;
    const worldZ = (elevation + 0.1) * accuracy;  // Block基础厚度

    // Three.js坐标
    const threeX = worldX;
    const threeY = -worldY;
    const threeZ = worldZ;

    return {
        position: [threeX, threeY, threeZ],
        worldPosition: [worldX / accuracy, worldY / accuracy, worldZ / accuracy]
    };
}
```

### 2. Block顶点计算
```javascript
const getBlockVertices = (blockX, blockY, elevation) => {
    const side = block_size.side;
    const accuracy = block_size.accuracy;

    const z = elevation * accuracy;

    return {
        // 四个顶点的世界坐标
        sw: [(blockX - 1) * side, -blockY * side, z],
        se: [(blockX - 1) * side + side, -blockY * side, z],
        nw: [(blockX - 1) * side, -(blockY - 1) * side - side, z],
        ne: [(blockX - 1) * side + side, -(blockY - 1) * side - side, z],

        // 转换为Three.js坐标
        sw_three: [sw[0], z, sw[1]],
        se_three: [se[0], z, se[1]],
        nw_three: [nw[0], z, nw[1]],
        ne_three: [ne[0], z, ne[1]],
    };
}
```

## 配置参数

```javascript
const config = {
    // Block配置
    block: {
        size: 16,              // Block尺寸（米）
        accuracy: 1000,        // 转换精度
        limit: [4096, 4096],  // 世界边界
    },

    // 玩家配置
    player: {
        height: 1.7,          // 玩家身高（米）
        eyeHeight: 1.6,       // 眼睛高度（米）
        moveSpeed: 1.5,        // 移动速度（米/秒）
        rotateSpeed: 0.05,     // 旋转速度（弧度/帧）
        jumpHeight: 1,         // 跳跃高度（米）
    },

    // 渲染配置
    render: {
        fov: 50,               // 视场角
        near: 0.1,             // 近裁剪面
        far: 1000000,          // 远裁剪面
    },
}
```

## 坐标系统常量

```javascript
// 角度转换常量
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// 方向常量
const DIRECTIONS = {
    NORTH: 0,
    NORTHEAST: 45,
    EAST: 90,
    SOUTHEAST: 135,
    SOUTH: 180,
    SOUTHWEST: 225,
    WEST: 270,
    NORTHWEST: 315,
}

// 面常量
const FACES = {
    TOP: 0,          // 上面（+Y）
    BOTTOM: 1,       // 下面（-Y）
    NORTH: 2,       // 北面（-Z）
    SOUTH: 3,       // 南面（+Z）
    EAST: 4,        // 东面（+X）
    WEST: 5,        // 西面（-X）
}
```
