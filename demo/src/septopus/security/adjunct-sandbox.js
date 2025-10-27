/**
 * Septopus Adjunct Sandbox Environment
 * 
 * 安全的 JavaScript 代码执行环境，用于运行从链上或 IPFS 加载的 Adjunct 代码
 * 
 * @author Septopus Team
 * @date 2025-01-21
 */

class AdjunctSandbox {
    constructor(options = {}) {
        this.worker = null;
        this.messageId = 0;
        this.pendingMessages = new Map();
        
        // 安全配置
        this.config = {
            timeout: options.timeout || 30000,
            maxMemory: options.maxMemory || 50 * 1024 * 1024, // 50MB
            allowedAPIs: options.allowedAPIs || [
                'three',
                'septopus-core',
                'math',
                'json'
            ],
            blockedAPIs: [
                'fetch',
                'XMLHttpRequest', 
                'localStorage',
                'sessionStorage',
                'indexedDB',
                'navigator',
                'location',
                'document',
                'window',
                'eval',
                'Function'
            ]
        };
        
        this.initWorker();
    }

    /**
     * 初始化 Web Worker
     */
    initWorker() {
        // 创建 Worker Blob URL
        const workerCode = this.generateWorkerCode();
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.workerUrl = URL.createObjectURL(blob);
        
        this.worker = new Worker(this.workerUrl);
        this.worker.onmessage = this.handleWorkerMessage.bind(this);
        this.worker.onerror = this.handleWorkerError.bind(this);
    }

    /**
     * 生成 Worker 执行代码
     */
    generateWorkerCode() {
        return `
            // 沙箱环境全局变量
            const sandbox = {
                allowedAPIs: ${JSON.stringify(this.config.allowedAPIs)},
                blockedAPIs: ${JSON.stringify(this.config.blockedAPIs)},
                three: null,
                septopusCore: null,
                console: {
                    log: (...args) => postMessage({type: 'console', level: 'log', args}),
                    warn: (...args) => postMessage({type: 'console', level: 'warn', args}),
                    error: (...args) => postMessage({type: 'console', level: 'error', args})
                }
            };

            // 禁用危险 API
            ${this.config.blockedAPIs.map(api => `
                if (typeof ${api} !== 'undefined') {
                    ${api} = undefined;
                }
            `).join('')}

            // 安全的 API 包装器
            const safeAPIs = {
                Math: Math,
                JSON: JSON,
                Object: Object,
                Array: Array,
                Date: Date,
                String: String,
                Number: Number,
                Boolean: Boolean
            };

            // 消息处理器
            onmessage = function(e) {
                const { type, id, code, apis, data } = e.data;
                
                try {
                    switch(type) {
                        case 'execute':
                            executeAdjunctCode(code, apis, id);
                            break;
                        case 'setAPIs':
                            setAllowedAPIs(apis);
                            break;
                        case 'validate':
                            validateCode(code, id);
                            break;
                        default:
                            postMessage({
                                type: 'error',
                                id,
                                error: 'Unknown message type: ' + type
                            });
                    }
                } catch (error) {
                    postMessage({
                        type: 'error',
                        id,
                        error: error.message,
                        stack: error.stack
                    });
                }
            };

            /**
             * 执行 Adjunct 代码
             */
            function executeAdjunctCode(code, apis, messageId) {
                try {
                    // 代码验证
                    validateCodeSafety(code);
                    
                    // 设置可用 API
                    const context = createExecutionContext(apis);
                    
                    // 创建安全的执行函数
                    const executeFunction = new Function(
                        ...Object.keys(context),
                        \`
                        "use strict";
                        // 禁用一些全局对象
                        const window = undefined;
                        const document = undefined;
                        const global = undefined;
                        const globalThis = undefined;
                        
                        // 执行用户代码
                        \${code}
                        
                        // 返回结果
                        if (typeof hooks !== 'undefined') {
                            return hooks;
                        }
                        return null;
                        \`
                    );
                    
                    // 执行代码
                    const result = executeFunction(...Object.values(context));
                    
                    postMessage({
                        type: 'success',
                        id: messageId,
                        result: result
                    });
                    
                } catch (error) {
                    postMessage({
                        type: 'error',
                        id: messageId,
                        error: error.message,
                        stack: error.stack
                    });
                }
            }

            /**
             * 代码安全性验证
             */
            function validateCodeSafety(code) {
                // 检查危险关键词
                const dangerousPatterns = [
                    /eval\\s*\\(/,
                    /Function\\s*\\(/,
                    /setTimeout\\s*\\(/,
                    /setInterval\\s*\\(/,
                    /import\\s*\\(/,
                    /require\\s*\\(/,
                    /fetch\\s*\\(/,
                    /XMLHttpRequest/,
                    /localStorage/,
                    /sessionStorage/,
                    /document\\./,
                    /window\\./,
                    /navigator\\./,
                    /location\\./
                ];
                
                for (const pattern of dangerousPatterns) {
                    if (pattern.test(code)) {
                        throw new Error(\`Dangerous code pattern detected: \${pattern}\`);
                    }
                }
                
                // 检查代码长度
                if (code.length > 100000) { // 100KB limit
                    throw new Error('Code too large');
                }
            }

            /**
             * 创建执行上下文
             */
            function createExecutionContext(apis) {
                const context = {
                    console: sandbox.console,
                    Math: safeAPIs.Math,
                    JSON: safeAPIs.JSON,
                    Object: safeAPIs.Object,
                    Array: safeAPIs.Array,
                    Date: safeAPIs.Date
                };
                
                // 添加允许的 API
                if (apis && apis.three) {
                    context.THREE = apis.three;
                }
                
                if (apis && apis.septopusCore) {
                    context.VBW = apis.septopusCore;
                }
                
                return context;
            }

            /**
             * 验证代码（不执行）
             */
            function validateCode(code, messageId) {
                try {
                    validateCodeSafety(code);
                    
                    // 语法检查
                    new Function(code);
                    
                    postMessage({
                        type: 'validation-success',
                        id: messageId
                    });
                } catch (error) {
                    postMessage({
                        type: 'validation-error',
                        id: messageId,
                        error: error.message
                    });
                }
            }
        `;
    }

    /**
     * 处理 Worker 消息
     */
    handleWorkerMessage(event) {
        const { type, id, result, error, level, args } = event.data;
        
        if (type === 'console') {
            // 转发 console 输出
            console[level](`[Adjunct Sandbox]`, ...args);
            return;
        }
        
        const promise = this.pendingMessages.get(id);
        if (promise) {
            this.pendingMessages.delete(id);
            
            if (type === 'success' || type === 'validation-success') {
                promise.resolve(result);
            } else if (type === 'error' || type === 'validation-error') {
                promise.reject(new Error(error));
            }
        }
    }

    /**
     * 处理 Worker 错误
     */
    handleWorkerError(error) {
        console.error('[Adjunct Sandbox] Worker error:', error);
        
        // 清理所有待处理的消息
        for (const [id, promise] of this.pendingMessages) {
            promise.reject(new Error('Sandbox worker crashed'));
        }
        this.pendingMessages.clear();
        
        // 重启 Worker
        this.restart();
    }

    /**
     * 执行 Adjunct 代码
     */
    async executeAdjunct(code, apis = {}) {
        const messageId = ++this.messageId;
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingMessages.delete(messageId);
                reject(new Error('Execution timeout'));
            }, this.config.timeout);
            
            this.pendingMessages.set(messageId, {
                resolve: (result) => {
                    clearTimeout(timeout);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            });
            
            this.worker.postMessage({
                type: 'execute',
                id: messageId,
                code,
                apis
            });
        });
    }

    /**
     * 验证代码安全性
     */
    async validateCode(code) {
        const messageId = ++this.messageId;
        
        return new Promise((resolve, reject) => {
            this.pendingMessages.set(messageId, { resolve, reject });
            
            this.worker.postMessage({
                type: 'validate',
                id: messageId,
                code
            });
        });
    }

    /**
     * 重启沙箱
     */
    restart() {
        if (this.worker) {
            this.worker.terminate();
        }
        this.initWorker();
    }

    /**
     * 销毁沙箱
     */
    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        
        if (this.workerUrl) {
            URL.revokeObjectURL(this.workerUrl);
            this.workerUrl = null;
        }
        
        this.pendingMessages.clear();
    }
}

export default AdjunctSandbox;