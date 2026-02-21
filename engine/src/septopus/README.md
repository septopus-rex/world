# Septopus World Engine

## Construct

* Language: Javascript
* Render Engine: [three.js](https://threejs.org/)
* Client: Mobile & PC
* Blockchain Network: Solana
* Version: [EN](README.md) | [CN](README_cn.md)

## Index of Engine Component

* [Framework](docs/wall.md)

## Format

### Modified Format

* `Modified Format` is used to make the modification unique format, then easy to make changes.

```Javascript
    //single modification task sample
    /***************** add *****************/
    {
        adjunct:"wall",
        action:"add",
        params:{
            x:1.6,
            oy:3.6,
        }
    }

    /***************** remove *****************/
    {
        adjunct:"wall",
        action:"remove",
        params:{
            index:1,
        }
    }

    /***************** set/update *****************/
    {
        adjunct:"wall",
        action:"set",
        params:{
            index:1,
            z:1.3,
        }
    }
```