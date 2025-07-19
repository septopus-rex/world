# Septopus的运行模式

* 使用`Framework`的`mode`方法进行模式切换，调用如下：

```Javascript
    const target = { x: x, y: y, world: world, container: dom_id }
    const mode = def.MODE_EDIT;
    VBW.mode(mode, target, (done) => {
        
    });
```

## Normal模式

## 游戏模式

* 游戏模式是为了提升玩家的体验，有两方面的功能需要实现，一是预加载，二是启动触发器支持

### 区域预加载

```Javascript
    const target = { x: x, y: y, world: world, container: dom_id }
    const mode = def.MODE_EDIT;
    VBW.mode(mode, target, (done) => {
        
    });
```

### 预渲染

### 网络访问控制
