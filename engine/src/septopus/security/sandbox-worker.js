/**
 * Septopus Sandbox Worker
 * 
 * 在 Web Worker 中安全执行 Adjunct 代码的沙箱环境
 * 
 * @author Septopus Team
 * @date 2025-01-21
 */

// 安全的全局环境设置
const SAFE_GLOBALS = {
    // 基础 JavaScript 对象
    Object, Array, String, Number, Boolean, Date, Math, JSON, RegExp,
    Promise, Map, Set, WeakMap, WeakSet,
    
    // 错误处理
    Error, TypeError, ReferenceError, SyntaxError,
    
    // 实用函数
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent,
    
    // 定时器（受限制的）
    setTimeout: (...args) => {
        if (args[1] > 60000) { // 最大 60 秒
            throw new Error('Timeout too long');
        }
        return setTimeout(...args);
    },
    clearTimeout,
    
    // Console（用于调试）
    console: {
        log: (...args) => postMessage({ type: 'console', level: 'log', args }),
        warn: (...args) => postMessage({ type: 'console', level: 'warn', args }),
        error: (...args) => postMessage({ type: 'console', level: 'error', args })
    }
};

// 被禁止的全局对象
const BLOCKED_GLOBALS = [
    'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
    'localStorage', 'sessionStorage', 'indexedDB',
    'navigator', 'location', 'history', 'window', 'document',
    'importScripts', 'Worker', 'SharedWorker', 'ServiceWorker',
    'eval', 'Function', 'GeneratorFunction', 'AsyncFunction'
];

// 代码执行上下文
let adjunctContext = null;
let adjunctAPIs = null;

// 消息处理器
self.onmessage = async function(event) {
    const { type, data } = event.data;
    
    try {
        switch (type) {
            case 'init':
                initializeSandbox(data);
                break;
                
            case 'validate':
                await validateCode(data.code);
                postMessage({ type: 'validated', success: true });
                break;
                
            case 'execute':
                const result = await executeAdjunct(data.code, data.apis);
                postMessage({ type: 'executed', success: true, result });
                break;
                
            case 'call':
                const callResult = await callAdjunctMethod(data.method, data.args);
                postMessage({ 
                    type: 'called', 
                    success: true, 
                    result: callResult,
                    callId: data.callId 
                });
                break;
                
            case 'destroy':
                destroySandbox();
                break;
                
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    } catch (error) {
        postMessage({ 
            type: 'error', 
            error: {
                message: error.message,
                stack: error.stack,
                name: error.name
            },
            callId: data.callId
        });
    }
};

/**
 * 初始化沙箱环境
 */
function initializeSandbox(config = {}) {
    // 清理全局环境
    for (const key of BLOCKED_GLOBALS) {
        if (key in self) {
            try {
                delete self[key];
            } catch (e) {
                // 某些属性可能无法删除，尝试覆盖
                self[key] = undefined;
            }
        }
    }
    
    // 设置安全的全局对象
    for (const [key, value] of Object.entries(SAFE_GLOBALS)) {
        self[key] = value;
    }
    
    // 添加配置选项
    self.SANDBOX_CONFIG = {
        maxExecutionTime: config.maxExecutionTime || 5000,
        maxMemoryUsage: config.maxMemoryUsage || 50 * 1024 * 1024, // 50MB
        allowedAPIs: config.allowedAPIs || ['three', 'septopusCore']
    };
    
    postMessage({ type: 'initialized', success: true });
}

/**
 * 验证代码安全性
 */
async function validateCode(code) {
    // 基础语法检查
    if (typeof code !== 'string') {
        throw new Error('Code must be a string');
    }
    
    if (code.length === 0) {
        throw new Error('Code cannot be empty');
    }
    
    // 检查禁用的关键字和模式
    const dangerousPatterns = [
        /eval\s*\(/gi,
        /Function\s*\(/gi,
        /import\s*\(/gi,
        /require\s*\(/gi,
        /process\s*\./gi,
        /global\s*\./gi,
        /window\s*\./gi,
        /document\s*\./gi,
        /fetch\s*\(/gi,
        /XMLHttpRequest/gi,
        /WebSocket/gi,
        /localStorage/gi,
        /sessionStorage/gi,
        /__proto__/gi,
        /constructor/gi,
        /prototype/gi
    ];
    
    for (const pattern of dangerousPatterns) {
        if (pattern.test(code)) {
            throw new Error(`Dangerous pattern detected: ${pattern.source}`);
        }
    }
    
    // 尝试解析语法
    try {
        new Function(code);
    } catch (error) {
        throw new Error(`Syntax error: ${error.message}`);
    }
    
    // 检查代码复杂度（简单的行数检查）
    const lines = code.split('\n').length;
    if (lines > 1000) {
        throw new Error('Code too complex (too many lines)');
    }
}

/**
 * 在沙箱中执行 Adjunct 代码
 */
async function executeAdjunct(code, apis) {
    // 验证代码
    await validateCode(code);
    
    // 设置 API
    adjunctAPIs = apis || {};
    
    // 创建受限的执行上下文
    const context = createExecutionContext();
    
    // 添加超时保护
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error('Execution timeout'));
        }, self.SANDBOX_CONFIG.maxExecutionTime);
    });
    
    // 执行代码
    const executePromise = new Promise((resolve, reject) => {
        try {
            // 在函数作用域中执行代码
            const func = new Function('context', 'apis', `
                "use strict";
                ${code}
                
                // 返回 Adjunct 对象
                if (typeof createAdjunct === 'function') {
                    return createAdjunct(apis);
                } else if (typeof Adjunct !== 'undefined') {
                    return Adjunct;
                } else {
                    throw new Error('No Adjunct found. Code must define createAdjunct() function or Adjunct object.');
                }
            `);
            
            const result = func(context, adjunctAPIs);
            resolve(result);
            
        } catch (error) {
            reject(error);
        }
    });
    
    // 等待执行完成或超时
    const result = await Promise.race([executePromise, timeoutPromise]);
    
    // 验证返回的 Adjunct 对象
    if (!result || typeof result !== 'object') {
        throw new Error('Adjunct must return an object');
    }
    
    // 存储 Adjunct 上下文
    adjunctContext = result;
    
    return {
        name: result.name || 'Unknown',
        version: result.version || '1.0.0',
        description: result.description || '',
        methods: Object.keys(result).filter(key => typeof result[key] === 'function')
    };
}

/**
 * 调用 Adjunct 方法
 */
async function callAdjunctMethod(methodName, args = []) {
    if (!adjunctContext) {
        throw new Error('No Adjunct loaded');
    }
    
    if (typeof adjunctContext[methodName] !== 'function') {
        throw new Error(`Method ${methodName} not found`);
    }
    
    // 添加超时保护
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error('Method call timeout'));
        }, self.SANDBOX_CONFIG.maxExecutionTime);
    });
    
    const callPromise = Promise.resolve(adjunctContext[methodName](...args));
    
    return await Promise.race([callPromise, timeoutPromise]);
}

/**
 * 创建执行上下文
 */
function createExecutionContext() {
    return {
        // 提供受限的工具函数
        log: (message) => {
            postMessage({ type: 'log', message });
        },
        
        // 时间相关
        now: () => Date.now(),
        
        // 数学工具
        random: Math.random,
        
        // 安全的 JSON 操作
        parseJSON: (str) => {
            try {
                return JSON.parse(str);
            } catch (e) {
                throw new Error('Invalid JSON');
            }
        },
        
        stringifyJSON: (obj) => {
            try {
                return JSON.stringify(obj);
            } catch (e) {
                throw new Error('Cannot stringify object');
            }
        }
    };
}

/**
 * 销毁沙箱
 */
function destroySandbox() {
    adjunctContext = null;
    adjunctAPIs = null;
    postMessage({ type: 'destroyed', success: true });
    self.close();
}

// 错误处理
self.onerror = function(error) {
    postMessage({ 
        type: 'error', 
        error: {
            message: error.message,
            filename: error.filename,
            lineno: error.lineno,
            colno: error.colno
        }
    });
};

self.onunhandledrejection = function(event) {
    postMessage({ 
        type: 'error', 
        error: {
            message: event.reason.message || 'Unhandled promise rejection',
            stack: event.reason.stack
        }
    });
};