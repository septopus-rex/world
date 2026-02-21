# 3D libraray

## Standard Three Object

```Javascript
    //Geometry format
    {
        cat:"geometry",
        type:"box",     //[ "box","line","group",... ]
        params:{
            size:[1,1,1],
            position:[0,0,0],
            rotation:[0,0,0],
            texture:"TEXTURE_OBJECT",
        },      
    }
```

* To get the Three.js object, you can call `ThreeObject.get("geometry","box",params)`.

## Three Object Parameters

### Geometry

#### Box

* Create parameters.

```Javascript
    {
        fov: 55,        //相机镜头
        width: 1600,
        height: 900,
        near:0.1,
        far:10000,
    }
```

#### Line

#### Ball


### Basic

#### Scene

#### Renderer

#### Camera

* Create parameters.

```Javascript
    {
        fov: 55,        //相机镜头
        width: 1600,
        height: 900,
        near:0.1,
        far:10000,
    }
```

### Material

#### Meshbasic

#### Texture

### Movement

* Control player in controller, the result write to `env.player`, update this frequently.