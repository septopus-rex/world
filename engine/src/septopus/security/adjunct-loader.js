/**
 * Septopus Adjunct Loader
 * 
 * 安全的 Adjunct 动态加载系统，支持从 IPFS 和链上加载代码
 * 
 * @author Septopus Team
 * @date 2025-01-21
 */

import AdjunctSandbox from './adjunct-sandbox.js';

class AdjunctLoader {
    constructor(options = {}) {
        this.sandbox = new AdjunctSandbox(options.sandbox);
        this.cache = new Map(); // 已加载的 Adjunct 缓存
        this.ipfsGateway = options.ipfsGateway || 'https://gateway.pinata.cloud/ipfs/';
        this.retryCount = options.retryCount || 3;
        this.timeout = options.timeout || 10000;
        
        // 安全配置
        this.security = {
            maxCodeSize: options.maxCodeSize || 100 * 1024, // 100KB
            allowedDomains: options.allowedDomains || [
                'gateway.pinata.cloud',
                'ipfs.io',
                'dweb.link'
            ],
            codeHashValidation: options.codeHashValidation !== false,
            signatureValidation: options.signatureValidation || false
        };
    }

    /**
     * 从 IPFS 加载 Adjunct 代码
     */
    async loadFromIPFS(ipfsHash, codeHash = null) {
        // 检查缓存
        const cacheKey = `ipfs:${ipfsHash}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // 获取代码
            const code = await this.fetchFromIPFS(ipfsHash);
            
            // 验证代码哈希
            if (codeHash && this.security.codeHashValidation) {
                const isValid = await this.verifyCodeHash(code, codeHash);
                if (!isValid) {
                    throw new Error('Code hash verification failed');
                }
            }
            
            // 在沙箱中验证代码
            await this.sandbox.validateCode(code);
            
            // 执行代码并获取 Adjunct
            const adjunct = await this.sandbox.executeAdjunct(code, this.getAPIs());
            
            // 缓存结果
            this.cache.set(cacheKey, adjunct);
            
            return adjunct;
            
        } catch (error) {
            console.error(`Failed to load Adjunct from IPFS ${ipfsHash}:`, error);
            throw error;
        }
    }

    /**
     * 从链上加载 Adjunct 代码（如果实现了链上存储）
     */
    async loadFromChain(contractAddress, adjunctId) {
        const cacheKey = `chain:${contractAddress}:${adjunctId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // 从智能合约获取代码
            const { code, hash } = await this.fetchFromContract(contractAddress, adjunctId);
            
            // 验证和执行
            await this.sandbox.validateCode(code);
            const adjunct = await this.sandbox.executeAdjunct(code, this.getAPIs());
            
            // 缓存结果
            this.cache.set(cacheKey, adjunct);
            
            return adjunct;
            
        } catch (error) {
            console.error(`Failed to load Adjunct from chain ${adjunctId}:`, error);
            throw error;
        }
    }

    /**
     * 从 IPFS 获取代码内容
     */
    async fetchFromIPFS(ipfsHash) {
        let lastError = null;
        
        for (let i = 0; i < this.retryCount; i++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.timeout);
                
                const response = await fetch(\`\${this.ipfsGateway}\${ipfsHash}\`, {
                    signal: controller.signal,
                    headers: {
                        'Accept': 'text/javascript, application/javascript'
                    }
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
                }
                
                const code = await response.text();
                
                // 检查代码大小
                if (code.length > this.security.maxCodeSize) {
                    throw new Error(\`Code too large: \${code.length} bytes\`);
                }
                
                return code;
                
            } catch (error) {
                lastError = error;
                console.warn(\`IPFS fetch attempt \${i + 1} failed:`, error);
                
                // 等待后重试
                if (i < this.retryCount - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                }
            }
        }
        
        throw new Error(\`Failed to fetch from IPFS after \${this.retryCount} attempts: \${lastError.message}\`);
    }

    /**
     * 从智能合约获取代码
     */
    async fetchFromContract(contractAddress, adjunctId) {
        // 这里需要实现与 Solana 合约的交互
        // 目前项目中合约存储的是 IPFS 哈希，所以实际上还是从 IPFS 获取
        throw new Error('Chain-based code loading not implemented yet');
    }

    /**
     * 验证代码哈希
     */
    async verifyCodeHash(code, expectedHash) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(code);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const actualHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            return actualHash === expectedHash;
        } catch (error) {
            console.error('Hash verification failed:', error);
            return false;
        }
    }

    /**
     * 获取可用的 API
     */
    getAPIs() {
        return {
            three: window.THREE,
            septopusCore: window.VBW
        };
    }

    /**
     * 预加载 Adjunct
     */
    async preload(adjunctList) {
        const promises = adjunctList.map(async (adjunct) => {
            try {
                if (adjunct.ipfsHash) {
                    await this.loadFromIPFS(adjunct.ipfsHash, adjunct.codeHash);
                } else if (adjunct.contractAddress) {
                    await this.loadFromChain(adjunct.contractAddress, adjunct.id);
                }
            } catch (error) {
                console.warn(\`Failed to preload adjunct \${adjunct.name}:`, error);
            }
        });
        
        await Promise.allSettled(promises);
    }

    /**
     * 清理缓存
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * 获取缓存统计
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }

    /**
     * 销毁加载器
     */
    destroy() {
        this.sandbox.destroy();
        this.clearCache();
    }
}

export default AdjunctLoader;