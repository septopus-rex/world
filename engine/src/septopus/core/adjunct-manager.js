/**
 * Septopus Adjunct Manager
 * 
 * 管理动态加载的 Adjunct 组件，集成到 Septopus 引擎
 * 
 * @author Septopus Team
 * @date 2025-01-21
 */

import AdjunctLoader from '../security/adjunct-loader.js';

class AdjunctManager {
    constructor(vbw, options = {}) {
        this.vbw = vbw; // Septopus VBW 引擎实例
        this.loader = new AdjunctLoader(options.loader);
        this.adjuncts = new Map(); // 已加载的 Adjuncts
        this.activeAdjuncts = new Set(); // 当前激活的 Adjuncts
        this.updateQueue = []; // 需要更新的 Adjuncts
        
        // 配置选项
        this.options = {
            maxConcurrentAdjuncts: options.maxConcurrentAdjuncts || 50,
            updateInterval: options.updateInterval || 16, // ~60fps
            enablePerformanceMonitoring: options.enablePerformanceMonitoring || true,
            ...options
        };
        
        // 性能监控
        this.performance = {
            totalUpdateTime: 0,
            averageUpdateTime: 0,
            frameCount: 0,
            adjunctStats: new Map()
        };
        
        // 开始更新循环
        this.startUpdateLoop();
    }

    /**
     * 从 IPFS 加载并实例化 Adjunct
     */
    async loadAdjunctFromIPFS(id, ipfsHash, codeHash = null, options = {}) {
        try {
            // 检查是否已加载
            if (this.adjuncts.has(id)) {
                console.warn(`Adjunct ${id} already loaded`);
                return this.adjuncts.get(id);
            }
            
            // 检查并发限制
            if (this.adjuncts.size >= this.options.maxConcurrentAdjuncts) {
                throw new Error('Maximum concurrent adjuncts reached');
            }
            
            // 加载 Adjunct 定义
            const adjunctDef = await this.loader.loadFromIPFS(ipfsHash, codeHash);
            
            // 创建 Adjunct 实例
            const adjunctInstance = await this.createAdjunctInstance(id, adjunctDef, options);
            
            // 存储实例
            this.adjuncts.set(id, adjunctInstance);
            
            console.log(`Adjunct ${id} loaded successfully`);
            return adjunctInstance;
            
        } catch (error) {
            console.error(`Failed to load adjunct ${id}:`, error);
            throw error;
        }
    }

    /**
     * 创建 Adjunct 实例
     */
    async createAdjunctInstance(id, adjunctDef, options = {}) {
        const instance = {
            id,
            definition: adjunctDef,
            proxy: null,
            isActive: false,
            isInitialized: false,
            initOptions: options,
            performance: {
                updateCount: 0,
                totalUpdateTime: 0,
                averageUpdateTime: 0,
                lastUpdateTime: 0
            },
            
            // 代理方法
            init: async (initOptions = {}) => {
                if (instance.isInitialized) {
                    console.warn(`Adjunct ${id} already initialized`);
                    return;
                }
                
                const mergedOptions = { ...options, ...initOptions };
                
                try {
                    // 调用沙箱中的 init 方法
                    await this.loader.sandbox.callMethod('init', [
                        this.vbw.scene, // 传入当前场景
                        mergedOptions
                    ]);
                    
                    instance.isInitialized = true;
                    console.log(`Adjunct ${id} initialized`);
                    
                } catch (error) {
                    console.error(`Failed to initialize adjunct ${id}:`, error);
                    throw error;
                }
            },
            
            activate: () => {
                if (instance.isActive) return;
                
                instance.isActive = true;
                this.activeAdjuncts.add(instance);
                this.updateQueue.push(instance);
                
                console.log(`Adjunct ${id} activated`);
            },
            
            deactivate: () => {
                if (!instance.isActive) return;
                
                instance.isActive = false;
                this.activeAdjuncts.delete(instance);
                
                // 从更新队列中移除
                const index = this.updateQueue.indexOf(instance);
                if (index > -1) {
                    this.updateQueue.splice(index, 1);
                }
                
                console.log(`Adjunct ${id} deactivated`);
            },
            
            destroy: async () => {
                try {
                    instance.deactivate();
                    
                    if (instance.isInitialized) {
                        await this.loader.sandbox.callMethod('destroy', [this.vbw.scene]);
                    }
                    
                    this.adjuncts.delete(id);
                    this.performance.adjunctStats.delete(id);
                    
                    console.log(`Adjunct ${id} destroyed`);
                    
                } catch (error) {
                    console.error(`Failed to destroy adjunct ${id}:`, error);
                }
            },
            
            // 调用 Adjunct 方法的代理
            call: async (methodName, ...args) => {
                if (!instance.isInitialized) {
                    throw new Error(`Adjunct ${id} not initialized`);
                }
                
                try {
                    return await this.loader.sandbox.callMethod(methodName, args);
                } catch (error) {
                    console.error(`Failed to call ${methodName} on adjunct ${id}:`, error);
                    throw error;
                }
            }
        };
        
        return instance;
    }

    /**
     * 开始更新循环
     */
    startUpdateLoop() {
        const update = () => {
            const startTime = performance.now();
            
            // 更新所有激活的 Adjuncts
            this.updateActiveAdjuncts();
            
            // 性能监控
            if (this.options.enablePerformanceMonitoring) {
                const updateTime = performance.now() - startTime;
                this.updatePerformanceStats(updateTime);
            }
            
            // 继续下一帧
            setTimeout(update, this.options.updateInterval);
        };
        
        update();
    }

    /**
     * 更新激活的 Adjuncts
     */
    async updateActiveAdjuncts() {
        const deltaTime = this.vbw.clock ? this.vbw.clock.getDelta() : 0.016;
        
        for (const instance of this.activeAdjuncts) {
            if (!instance.isInitialized || !instance.isActive) continue;
            
            try {
                const startTime = performance.now();
                
                // 调用 Adjunct 的 update 方法
                await instance.call('update', deltaTime);
                
                // 更新性能统计
                const updateTime = performance.now() - startTime;
                this.updateAdjunctPerformance(instance, updateTime);
                
            } catch (error) {
                console.error(`Error updating adjunct ${instance.id}:`, error);
                
                // 可选：自动停用有问题的 Adjunct
                if (error.message.includes('timeout') || error.message.includes('memory')) {
                    console.warn(`Auto-deactivating problematic adjunct ${instance.id}`);
                    instance.deactivate();
                }
            }
        }
    }

    /**
     * 更新 Adjunct 性能统计
     */
    updateAdjunctPerformance(instance, updateTime) {
        const perf = instance.performance;
        perf.updateCount++;
        perf.totalUpdateTime += updateTime;
        perf.averageUpdateTime = perf.totalUpdateTime / perf.updateCount;
        perf.lastUpdateTime = updateTime;
        
        // 存储到全局统计
        this.performance.adjunctStats.set(instance.id, {
            ...perf,
            name: instance.definition.name
        });
    }

    /**
     * 更新全局性能统计
     */
    updatePerformanceStats(updateTime) {
        this.performance.frameCount++;
        this.performance.totalUpdateTime += updateTime;
        this.performance.averageUpdateTime = 
            this.performance.totalUpdateTime / this.performance.frameCount;
    }

    /**
     * 获取 Adjunct 实例
     */
    getAdjunct(id) {
        return this.adjuncts.get(id);
    }

    /**
     * 获取所有 Adjunct 列表
     */
    getAllAdjuncts() {
        return Array.from(this.adjuncts.values());
    }

    /**
     * 获取激活的 Adjunct 列表
     */
    getActiveAdjuncts() {
        return Array.from(this.activeAdjuncts);
    }

    /**
     * 获取性能统计
     */
    getPerformanceStats() {
        return {
            global: {
                ...this.performance,
                activeAdjunctCount: this.activeAdjuncts.size,
                totalAdjunctCount: this.adjuncts.size
            },
            adjuncts: Array.from(this.performance.adjunctStats.entries()).map(([id, stats]) => ({
                id,
                ...stats
            }))
        };
    }

    /**
     * 批量加载 Adjuncts
     */
    async loadAdjuncts(adjunctList) {
        const results = [];
        
        for (const adjunctConfig of adjunctList) {
            try {
                const instance = await this.loadAdjunctFromIPFS(
                    adjunctConfig.id,
                    adjunctConfig.ipfsHash,
                    adjunctConfig.codeHash,
                    adjunctConfig.options
                );
                
                results.push({ id: adjunctConfig.id, success: true, instance });
                
            } catch (error) {
                results.push({ 
                    id: adjunctConfig.id, 
                    success: false, 
                    error: error.message 
                });
            }
        }
        
        return results;
    }

    /**
     * 清理所有 Adjuncts
     */
    async cleanup() {
        const destroyPromises = Array.from(this.adjuncts.values()).map(
            instance => instance.destroy()
        );
        
        await Promise.allSettled(destroyPromises);
        
        this.adjuncts.clear();
        this.activeAdjuncts.clear();
        this.updateQueue.length = 0;
        
        this.loader.destroy();
        
        console.log('Adjunct manager cleaned up');
    }
}

export default AdjunctManager;