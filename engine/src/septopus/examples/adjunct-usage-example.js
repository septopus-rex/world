/**
 * Septopus Adjunct Usage Example
 * 
 * 演示如何在 Septopus 引擎中使用安全的 Adjunct 系统
 * 
 * @author Septopus Team
 * @date 2025-01-21
 */

import AdjunctManager from '../core/adjunct-manager.js';

/**
 * 示例：在 Septopus 引擎中集成 Adjunct 系统
 */
class SeptopusAdjunctExample {
    constructor(vbw) {
        this.vbw = vbw;
        this.adjunctManager = null;
        this.loadedAdjuncts = new Map();
    }

    /**
     * 初始化 Adjunct 系统
     */
    async initializeAdjunctSystem() {
        try {
            // 创建 Adjunct 管理器
            this.adjunctManager = new AdjunctManager(this.vbw, {
                loader: {
                    ipfsGateway: 'https://gateway.pinata.cloud/ipfs/',
                    maxCodeSize: 100 * 1024, // 100KB
                    timeout: 10000
                },
                maxConcurrentAdjuncts: 20,
                enablePerformanceMonitoring: true
            });

            console.log('Adjunct system initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize adjunct system:', error);
            throw error;
        }
    }

    /**
     * 示例：加载旋转立方体 Adjunct
     */
    async loadRotatingCubeExample() {
        // 这里使用模拟的 IPFS 哈希，实际使用时需要真实的哈希
        const exampleAdjunctConfig = {
            id: 'rotating-cube-1',
            ipfsHash: 'QmExampleHashForRotatingCube123456789', // 模拟哈希
            codeHash: null, // 可选的代码哈希验证
            options: {
                size: 2,
                color: 0xff0000, // 红色
                rotationSpeed: 0.02,
                position: { x: 0, y: 5, z: 0 }
            }
        };

        try {
            // 由于这是示例，我们直接使用示例代码而不是从 IPFS 加载
            const adjunctCode = await this.getExampleAdjunctCode();
            
            // 创建一个模拟的加载过程
            const adjunct = await this.loadAdjunctFromCode(
                exampleAdjunctConfig.id,
                adjunctCode,
                exampleAdjunctConfig.options
            );

            this.loadedAdjuncts.set(exampleAdjunctConfig.id, adjunct);
            
            console.log('Rotating cube adjunct loaded successfully');
            return adjunct;

        } catch (error) {
            console.error('Failed to load rotating cube adjunct:', error);
            throw error;
        }
    }

    /**
     * 获取示例 Adjunct 代码
     */
    async getExampleAdjunctCode() {
        // 返回之前创建的示例 Adjunct 代码
        return `
function createAdjunct(apis) {
    const { three, septopusCore } = apis;
    
    return {
        name: "Rotating Cube",
        version: "1.0.0",
        description: "A simple rotating cube adjunct",
        author: "Septopus Team",
        
        _mesh: null,
        _rotationSpeed: 0.01,
        
        init: function(scene, options = {}) {
            if (!scene || !three) {
                throw new Error('Scene and Three.js required');
            }
            
            const geometry = new three.BoxGeometry(
                options.size || 1, 
                options.size || 1, 
                options.size || 1
            );
            
            const material = new three.MeshBasicMaterial({ 
                color: options.color || 0x00ff00,
                wireframe: options.wireframe || false
            });
            
            this._mesh = new three.Mesh(geometry, material);
            
            if (options.position) {
                this._mesh.position.set(
                    options.position.x || 0,
                    options.position.y || 0,
                    options.position.z || 0
                );
            }
            
            scene.add(this._mesh);
            this._rotationSpeed = options.rotationSpeed || 0.01;
            
            return this;
        },
        
        update: function(deltaTime) {
            if (this._mesh) {
                this._mesh.rotation.x += this._rotationSpeed;
                this._mesh.rotation.y += this._rotationSpeed * 0.7;
            }
        },
        
        setColor: function(color) {
            if (this._mesh && this._mesh.material) {
                this._mesh.material.color.setHex(color);
            }
        },
        
        setRotationSpeed: function(speed) {
            this._rotationSpeed = speed;
        },
        
        getPosition: function() {
            if (this._mesh) {
                return {
                    x: this._mesh.position.x,
                    y: this._mesh.position.y,
                    z: this._mesh.position.z
                };
            }
            return null;
        },
        
        setPosition: function(x, y, z) {
            if (this._mesh) {
                this._mesh.position.set(x, y, z);
            }
        },
        
        setVisible: function(visible) {
            if (this._mesh) {
                this._mesh.visible = visible;
            }
        },
        
        destroy: function(scene) {
            if (this._mesh && scene) {
                scene.remove(this._mesh);
                this._mesh.geometry.dispose();
                this._mesh.material.dispose();
                this._mesh = null;
            }
        },
        
        getInfo: function() {
            return {
                name: this.name,
                version: this.version,
                description: this.description,
                author: this.author,
                hasGeometry: !!this._mesh,
                position: this.getPosition(),
                rotationSpeed: this._rotationSpeed
            };
        }
    };
}`;
    }

    /**
     * 从代码加载 Adjunct（用于演示）
     */
    async loadAdjunctFromCode(id, code, options = {}) {
        try {
            // 这里直接使用沙箱加载器的功能
            const adjunct = await this.adjunctManager.loader.sandbox.executeAdjunct(code, {
                three: window.THREE,
                septopusCore: this.vbw
            });

            // 创建实例包装器
            const instance = {
                id,
                adjunct,
                isActive: false,
                isInitialized: false,

                async init(initOptions = {}) {
                    const mergedOptions = { ...options, ...initOptions };
                    await adjunct.init(this.vbw.scene, mergedOptions);
                    this.isInitialized = true;
                    console.log(`Adjunct ${id} initialized`);
                },

                activate() {
                    this.isActive = true;
                    console.log(`Adjunct ${id} activated`);
                },

                deactivate() {
                    this.isActive = false;
                    console.log(`Adjunct ${id} deactivated`);
                },

                async update(deltaTime) {
                    if (this.isActive && this.isInitialized && adjunct.update) {
                        await adjunct.update(deltaTime);
                    }
                },

                async call(methodName, ...args) {
                    if (!this.isInitialized) {
                        throw new Error(`Adjunct ${id} not initialized`);
                    }
                    if (typeof adjunct[methodName] === 'function') {
                        return await adjunct[methodName](...args);
                    }
                    throw new Error(`Method ${methodName} not found on adjunct ${id}`);
                },

                async destroy() {
                    this.deactivate();
                    if (this.isInitialized && adjunct.destroy) {
                        await adjunct.destroy(this.vbw.scene);
                    }
                    console.log(`Adjunct ${id} destroyed`);
                }
            };

            return instance;

        } catch (error) {
            console.error(`Failed to load adjunct from code:`, error);
            throw error;
        }
    }

    /**
     * 演示 Adjunct 交互
     */
    async demonstrateAdjunctInteractions() {
        try {
            // 加载示例 Adjunct
            const cubeAdjunct = await this.loadRotatingCubeExample();
            
            // 初始化 Adjunct
            await cubeAdjunct.init({
                size: 1.5,
                color: 0x00ff00,
                position: { x: 2, y: 0, z: -5 }
            });
            
            // 激活 Adjunct
            cubeAdjunct.activate();
            
            // 演示方法调用
            setTimeout(async () => {
                // 改变颜色
                await cubeAdjunct.call('setColor', 0xff0000);
                console.log('Changed cube color to red');
            }, 2000);
            
            setTimeout(async () => {
                // 改变旋转速度
                await cubeAdjunct.call('setRotationSpeed', 0.05);
                console.log('Increased rotation speed');
            }, 4000);
            
            setTimeout(async () => {
                // 获取位置信息
                const position = await cubeAdjunct.call('getPosition');
                console.log('Cube position:', position);
            }, 6000);
            
            setTimeout(async () => {
                // 获取 Adjunct 信息
                const info = await cubeAdjunct.call('getInfo');
                console.log('Adjunct info:', info);
            }, 8000);
            
            // 设置更新循环
            this.startAdjunctUpdateLoop();
            
        } catch (error) {
            console.error('Failed to demonstrate adjunct interactions:', error);
        }
    }

    /**
     * 开始 Adjunct 更新循环
     */
    startAdjunctUpdateLoop() {
        const update = async () => {
            const deltaTime = this.vbw.clock ? this.vbw.clock.getDelta() : 0.016;
            
            // 更新所有激活的 Adjuncts
            for (const [id, adjunct] of this.loadedAdjuncts) {
                try {
                    await adjunct.update(deltaTime);
                } catch (error) {
                    console.error(`Error updating adjunct ${id}:`, error);
                }
            }
            
            // 继续下一帧
            requestAnimationFrame(update);
        };
        
        update();
    }

    /**
     * 获取性能统计
     */
    getPerformanceStats() {
        if (this.adjunctManager) {
            return this.adjunctManager.getPerformanceStats();
        }
        return null;
    }

    /**
     * 清理资源
     */
    async cleanup() {
        // 销毁所有 Adjuncts
        for (const [id, adjunct] of this.loadedAdjuncts) {
            try {
                await adjunct.destroy();
            } catch (error) {
                console.error(`Error destroying adjunct ${id}:`, error);
            }
        }
        
        this.loadedAdjuncts.clear();
        
        // 清理 Adjunct 管理器
        if (this.adjunctManager) {
            await this.adjunctManager.cleanup();
        }
        
        console.log('Adjunct example cleaned up');
    }
}

// 导出用法示例
export default SeptopusAdjunctExample;

// 示例用法：
/*
// 在 Septopus 引擎初始化后使用
const adjunctExample = new SeptopusAdjunctExample(vbw);

// 初始化 Adjunct 系统
await adjunctExample.initializeAdjunctSystem();

// 演示 Adjunct 交互
await adjunctExample.demonstrateAdjunctInteractions();

// 获取性能统计
const stats = adjunctExample.getPerformanceStats();
console.log('Performance stats:', stats);

// 清理资源（在应用关闭时）
await adjunctExample.cleanup();
*/