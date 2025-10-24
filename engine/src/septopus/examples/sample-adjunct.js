/**
 * Septopus Sample Adjunct
 * 
 * 演示如何编写符合沙箱要求的 Adjunct 代码
 * 
 * @author Septopus Team
 * @date 2025-01-21
 */

/**
 * 创建一个简单的旋转立方体 Adjunct
 */
function createAdjunct(apis) {
    const { three, septopusCore } = apis;
    
    return {
        name: "Rotating Cube",
        version: "1.0.0",
        description: "A simple rotating cube adjunct",
        author: "Septopus Team",
        
        // 私有变量
        _mesh: null,
        _rotationSpeed: 0.01,
        
        /**
         * 初始化 Adjunct
         */
        init: function(scene, options = {}) {
            if (!scene || !three) {
                throw new Error('Scene and Three.js required');
            }
            
            // 创建几何体和材质
            const geometry = new three.BoxGeometry(
                options.size || 1, 
                options.size || 1, 
                options.size || 1
            );
            
            const material = new three.MeshBasicMaterial({ 
                color: options.color || 0x00ff00,
                wireframe: options.wireframe || false
            });
            
            // 创建网格
            this._mesh = new three.Mesh(geometry, material);
            
            // 设置位置
            if (options.position) {
                this._mesh.position.set(
                    options.position.x || 0,
                    options.position.y || 0,
                    options.position.z || 0
                );
            }
            
            // 添加到场景
            scene.add(this._mesh);
            
            // 设置旋转速度
            this._rotationSpeed = options.rotationSpeed || 0.01;
            
            return this;
        },
        
        /**
         * 更新 Adjunct（每帧调用）
         */
        update: function(deltaTime) {
            if (this._mesh) {
                this._mesh.rotation.x += this._rotationSpeed;
                this._mesh.rotation.y += this._rotationSpeed * 0.7;
            }
        },
        
        /**
         * 设置颜色
         */
        setColor: function(color) {
            if (this._mesh && this._mesh.material) {
                this._mesh.material.color.setHex(color);
            }
        },
        
        /**
         * 设置旋转速度
         */
        setRotationSpeed: function(speed) {
            this._rotationSpeed = speed;
        },
        
        /**
         * 获取位置
         */
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
        
        /**
         * 设置位置
         */
        setPosition: function(x, y, z) {
            if (this._mesh) {
                this._mesh.position.set(x, y, z);
            }
        },
        
        /**
         * 显示/隐藏
         */
        setVisible: function(visible) {
            if (this._mesh) {
                this._mesh.visible = visible;
            }
        },
        
        /**
         * 销毁 Adjunct
         */
        destroy: function(scene) {
            if (this._mesh && scene) {
                scene.remove(this._mesh);
                this._mesh.geometry.dispose();
                this._mesh.material.dispose();
                this._mesh = null;
            }
        },
        
        /**
         * 获取 Adjunct 信息
         */
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
}