/**
 * Core - definition
 *
 * @fileoverview
 *  1. definition keys here
 *  2. formats of engine
 *
 * @author Fuu
 * @date 2025-04-23
 */

const selection = {
    type: [             //select type of object
        "adjunct",      //0.
        "block",        //1.
        "ui",           //2.
        "player",       //3.
        "sky",          //4.
        "bag",          //5. objects in bag
    ],
    math: [             //condition calculation
        "==",
        ">",
        "<",
        ">=",
        "<=",
        "&&",
        "||",
    ],
    extend: {
        adjunct: [],    //use adjunct definition to do next step
        block: [],      //use block definition to do next step   
        ui: [
            "bubble",
            "toast",
            "dailog",
            "form",
        ],
        player: [
            "position",
            "rotation",
            "action",
        ],
        sky: [
            "weather",
            "intensity",
        ],
        way:[           //parameters combine method
            "set",
            "delta",
            "hidden",
            "add",
        ]
    }
}

const def = {
    format: {
        "std": {},
        "raw": [],
        "stop": [],
    },
    key: {

    },
}

const Definition = (name, type) => {

};

export default Definition;