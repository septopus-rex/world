# Septopus Frontend Sandbox Execution Environment

## 概述

Septopus 前端沙箱执行环境是一个安全的动态代码加载和执行系统，专为 Septopus World 项目设计。它允许从 IPFS 安全地加载和执行用户生成的 Adjunct 代码，同时防止恶意代码访问敏感的浏览器 API。

## 核心组件

### 1. AdjunctSandbox (`adjunct-sandbox.js`)
- **功能**: Web Worker 沙箱管理器
- **职责**: 创建隔离的执行环境，管理与 Worker 的通信
- **安全特性**: 
  - 阻止访问敏感 API
  - 代码验证和超时保护
  - 错误隔离和恢复

### 2. AdjunctLoader (`adjunct-loader.js`)
- **功能**: 动态代码加载器
- **职责**: 从 IPFS 获取代码，验证哈希，管理缓存
- **安全特性**:
  - 代码哈希验证
  - 大小限制和域名白名单
  - 重试机制和超时控制

### 3. Sandbox Worker (`sandbox-worker.js`)
- **功能**: Web Worker 执行环境
- **职责**: 在隔离环境中安全执行 Adjunct 代码
- **安全特性**:
  - 全局对象清理
  - 危险模式检测
  - 执行时间限制

### 4. AdjunctManager (`adjunct-manager.js`)
- **功能**: Adjunct 生命周期管理
- **职责**: 集成到 Septopus 引擎，管理多个 Adjunct 实例
- **特性**:
  - 性能监控
  - 并发控制
  - 自动错误恢复

## 安全措施

### 代码级安全
```javascript
// 1. 危险模式检测
const dangerousPatterns = [
    /eval\s*\(/gi,
    /Function\s*\(/gi,
    /import\s*\(/gi,
    /fetch\s*\(/gi,
    // ... 更多模式
];

// 2. 全局对象清理
const BLOCKED_GLOBALS = [
    'fetch', 'XMLHttpRequest', 'WebSocket',
    'localStorage', 'sessionStorage', 'indexedDB',
    'navigator', 'location', 'history', 'window', 'document'
];

// 3. 执行时间限制
const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Execution timeout')), 5000);
});
```

### 网络级安全
```javascript
// IPFS 域名白名单
allowedDomains: [
    'gateway.pinata.cloud',
    'ipfs.io',
    'dweb.link'
]

// 代码大小限制
maxCodeSize: 100 * 1024 // 100KB

// 哈希验证
const isValid = await verifyCodeHash(code, expectedHash);
```

## 使用方法

### 基本用法

```javascript
import AdjunctManager from './core/adjunct-manager.js';

// 1. 初始化 Adjunct 管理器
const adjunctManager = new AdjunctManager(vbw, {
    loader: {
        ipfsGateway: 'https://gateway.pinata.cloud/ipfs/',
        maxCodeSize: 100 * 1024,
        timeout: 10000
    },
    maxConcurrentAdjuncts: 20,
    enablePerformanceMonitoring: true
});

// 2. 加载 Adjunct
const adjunct = await adjunctManager.loadAdjunctFromIPFS(
    'my-adjunct-id',
    'QmYourIPFSHash...',
    'optional-code-hash',
    { /* init options */ }
);

// 3. 初始化和激活
await adjunct.init({
    size: 2,
    color: 0xff0000,
    position: { x: 0, y: 5, z: 0 }
});
adjunct.activate();

// 4. 调用方法
await adjunct.call('setColor', 0x00ff00);
const position = await adjunct.call('getPosition');

// 5. 清理
await adjunct.destroy();
```

### Adjunct 代码规范

```javascript
// Adjunct 代码必须定义 createAdjunct 函数
function createAdjunct(apis) {
    const { three, septopusCore } = apis;
    
    return {
        name: "My Adjunct",
        version: "1.0.0",
        description: "Description of my adjunct",
        
        // 必需方法
        init: function(scene, options = {}) {
            // 初始化逻辑
        },
        
        update: function(deltaTime) {
            // 每帧更新逻辑
        },
        
        destroy: function(scene) {
            // 清理资源
        },
        
        // 自定义方法
        setColor: function(color) {
            // 设置颜色
        },
        
        getPosition: function() {
            // 获取位置
            return { x: 0, y: 0, z: 0 };
        }
    };
}
```

## 性能监控

### 获取性能统计
```javascript
const stats = adjunctManager.getPerformanceStats();
console.log(stats);

// 输出示例:
{
    global: {
        totalUpdateTime: 1234.5,
        averageUpdateTime: 16.7,
        frameCount: 74,
        activeAdjunctCount: 3,
        totalAdjunctCount: 5
    },
    adjuncts: [
        {
            id: "rotating-cube-1",
            name: "Rotating Cube",
            updateCount: 74,
            totalUpdateTime: 123.4,
            averageUpdateTime: 1.67,
            lastUpdateTime: 1.2
        }
        // ... 更多 Adjunct 统计
    ]
}
```

## 错误处理

### 常见错误类型
1. **代码验证失败**: 危险模式检测或语法错误
2. **加载超时**: IPFS 网络问题或代码过大
3. **执行超时**: Adjunct 代码执行时间过长
4. **内存限制**: Adjunct 使用内存过多
5. **哈希验证失败**: 代码完整性检查失败

### 错误恢复机制
```javascript
// 自动停用有问题的 Adjunct
if (error.message.includes('timeout') || error.message.includes('memory')) {
    console.warn(`Auto-deactivating problematic adjunct ${instance.id}`);
    instance.deactivate();
}

// 重试机制
for (let i = 0; i < this.retryCount; i++) {
    try {
        // 尝试操作
        break;
    } catch (error) {
        if (i < this.retryCount - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}
```

## 最佳实践

### 1. 安全考虑
- 始终验证代码哈希
- 限制代码大小和执行时间
- 监控性能指标
- 定期清理缓存

### 2. 性能优化
- 预加载常用 Adjuncts
- 合理设置并发限制
- 使用性能监控识别瓶颈
- 及时销毁不用的 Adjuncts

### 3. 开发调试
- 使用控制台日志查看执行状态
- 监控性能统计发现问题
- 测试各种错误场景
- 验证资源清理是否完整

## 限制和注意事项

### 1. 功能限制
- 不支持动态导入其他模块
- 不能访问浏览器敏感 API
- 代码执行时间有限制
- 不支持多线程操作

### 2. 浏览器兼容性
- 需要支持 Web Workers
- 需要支持 ES6+ 语法
- 需要支持 async/await
- 需要支持 Crypto API

### 3. 网络依赖
- 依赖 IPFS 网关可用性
- 可能受网络延迟影响
- 需要处理网络超时

## 与 Solana 合约的集成

虽然当前实现主要从 IPFS 加载代码，但系统设计时考虑了与 Solana 智能合约的集成：

```javascript
// 未来可以从合约加载 Adjunct 元数据
const adjunctMetadata = await contract.getAdjunctMetadata(adjunctId);
const adjunct = await adjunctManager.loadAdjunctFromIPFS(
    adjunctId,
    adjunctMetadata.ipfsHash,
    adjunctMetadata.codeHash
);
```

## 总结

Septopus 前端沙箱执行环境提供了一个安全、高效的动态代码执行解决方案，完美解决了在浏览器中安全执行用户生成代码的挑战。通过 Web Workers 隔离、严格的安全检查和完善的错误处理，确保了系统的稳定性和安全性。