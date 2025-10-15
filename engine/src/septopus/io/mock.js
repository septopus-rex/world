/**
 * IO - API Datasource Mocker
 *
 * @fileoverview
 *  1.API router, manage all access to different network
 *  2.mock data to test quickly.
 *  3.events support and mock.
 *
 * @author Fuu
 * @date 2025-07-20
 */

import Toolbox from "../lib/toolbox";
import Design from "./design";

const mock = {
    adjunct: (index) => {
        return {
            common: {
                definition: {
                    "INDEX_OF_SIZE": 0,
                    "SIZE_X": 0,
                    "SIZE_Y": 1,
                    "SIZE_Z": 2,
                    "INDEX_OF_POSITION": 1,
                    "POSITION_X": 0,
                    "POSITION_Y": 1,
                    "POSITION_Z": 2,
                    "INDEX_OF_ROTATION": 2,
                    "ROTATION_X": 0,
                    "ROTATION_Y": 1,
                    "ROTATION_Z": 2,
                    "FACE_TOP":0,
                    "FACE_BOTTOM":1,
                    "FACE_FRONT":2,                 //from south to north
                    "FACE_BACK":3,
                    "FACE_LEFT":4,
                    "FACE_RIGTH":5,
                    "MODE_NORMAL":1,                //login player
                    "MODE_EDIT":2,                  //edit mode on your own block
                    "MODE_GAME":3,                  //preload all block data
                    "MODE_GHOST":4,                 //anonymous player, no trig
                    "INDEX_OF_RAW_ON_CHAIN_DATA":1, //block raw data index on chain
                    "VERSION_DEFAULT":2025,         //default version
                    "EFFECTS_MOVING":0,         //effects.moving
                    "EFFECTS_ROTATE":1,         //effects.rotate
                    "EFFECTS_SCALE":2,          //effects.scale
                    "EFFECTS_TEXTURE":3,        //effects.texture
                    "EFFECTS_CUSTOMIZE":4,        //effects.customize, by adjunct,
                },
                source: "SOLANA_PDA_ACCOUNT_OF_WORLD_COMMON",
                owner: "",
                format:{
                    "OBJECT_SELECTION":[],
                },
            },
            block:{
                definition: {
                    "BLOCK_INDEX_ELEVACATION":0,
                    "BLOCK_INDEX_STATUS":1,
                    "BLOCK_INDEX_ADJUNCTS":2,
                    "BLOCK_INDEX_GAME_SETTING":3,
                },
                sample:[0.2,1,[]],
                version:2025,
                code:"JAVASCRIPT_BASE64_CODE_STRING",
                source: "SOLANA_DATA_ACCOUNT",
                owner: "SOLANA_PDA_ACCOUNT_OF_BLOCK",
            },
            stop: {
                definition: {
                    "TYPE_OF_STOP": 3,
                },
                sample:[[1.2, 1.2, 1.2], [8, 8, 2], [0, 0, 0], 1, 1],
                version:2025,
                short:0x00b4,
                code:"JAVASCRIPT_BASE64_CODE_STRING",
                source: "SOLANA_DATA_ACCOUNT",
                owner: "SOLANA_PDA_ACCOUNT_OF_BASIC_ADJUNCT",
            },
            trigger: {
                definition: {
                    "RAW_TRIGGER_SHAPE_OPTION":     3,      //["box","ball","more"]
                    "RAW_TRIGGER_OPTION":           4,      //["in","out","hold"]
                    "RAW_ACTION_GROUP":             5,      //
                    "RAW_CONTRACT_ID_ON_CHAIN":     6,
                    "RAW_RUN_ONCE":                 7,
                    "RAW_ONLY_GAME_MODE":           8,

                    //action array [ "condition", "todo_task", "abord_task", "recover_task" ]
                    "ACTION_INDEX_CONDITION":   0,
                    "ACTION_INDEX_TODO":        1,
                    "ACTION_INDEX_ABORD":       2,
                    "ACTION_INDEX_RECOVER":     3,
                    //condition array [ "selection_array", "operator", "value" ]
                    "CONDITION_INDEX_SELECTION":    0,
                    "CONDITION_INDEX_OPERATOR":     1,
                    "CONDITION_INDEX_VALUE":        2,
                    //task array    [ "selection", ]

                    //section array,
                    "SELECTION_INDEX_TYPE":     0,
                    "SELECTION_TYPE_OPETION_SYSTEM":    1,
                    "SELECTION_TYPE_OPETION_ADJUNCT":   2,
                    "SELECTION_TYPE_OPETION_PLAYER":    3,
                    "SELECTION_TYPE_OPETION_BAG":       4,

                    //system selection
                    "SELECTION_SYSTEM_SUB":     1,
                    "SYSTEM_SUB_OPTION_UI":     1,
                    "SYSTEM_SUB_OPTION_TIME":   2,
                    "SYSTEM_SUB_OPTION_WEATHER":3,
                    "SYSTEM_SUB_OPTION_SKY":    4,

                    "SYSTEM_UI_OPTION_DIALOG": 1,
                    "SYSTEM_UI_OPTION_TOAST":  2,

                    //adjunct selection
                    "SELECTION_ADJUNCT_SHORT":  1,
                    "SELECTION_ADJUNCT_INDEX":  2,

                    //player selection
                    //["position","rotation","body","block","capacity","blood","magic"]
                    "SELECTION_PLAYER_ATTIBUTION":  1,
                    "PLAYER_ATTIBUTION_OPTION_POSITION":    0,
                    "PLAYER_ATTIBUTION_OPTION_ROTATION":    1,
                    "PLAYER_ATTIBUTION_OPTION_BODY":        2,
                    "PLAYER_ATTIBUTION_OPTION_BLOCK":       3,
                    "PLAYER_ATTIBUTION_OPTION_CAPACITY":    4,
                    "PLAYER_ATTIBUTION_OPTION_BLOOD":       5,
                    "PLAYER_ATTIBUTION_OPTION_MAGIC":       6,

                    //task definition
                    "TASK_SYSTEM_UI_":      1,

                    //bag selection
                    "SELECTION_BAG_OBJECT":             1,
                    "SELECTION_BAG_OBJECT_AMOUNT":      2,

                    //adjuction task action
                    "ACTION_ADJUNCT_SHOW":      1,
                    "ACTION_ADJUNCT_HIDE":      2,
                    "ACTION_ADJUNCT_UPDATE":    3,

                    "ADJUNCT_UPDATE_OPTION_INC":   1,
                    "ADJUNCT_UPDATE_OPTION_DEC":   1,

                    "EVENT_OPTION_IN":          1,
                    "EVENT_OPTION_OUT":         2,
                    "EVENT_OPTION_HOLD":        3,
                    "SHAPE_OPTION_BOX":         1,
                    "SHAPE_OPTION_BALL":        2,
                    "OPERATOR_!=":              0,
                    "OPERATOR_==":              1,
                    "OPERATOR_>":               2,
                    "OPERATOR_<":               3,
                    "OPERATOR_>=":              4,
                    "OPERATOR_<=":              5,
                },
                sample:[[2, 2, 3], [12, 4, 1.5], [0, 0, 0], 1, 1, [
                    [
                        [[1,3],1,0],                                //`condition`, system.weather == 0 ,can be empty, run anyway
                        [[1,1,2],[1,20]],                           //`task_todo`, system.ui.toast()
                        [[1,1,2],[1,33]],                           //`task_abord`, system.ui.toast()
                        [[2,0x00a1,1],[3,[[0,2],1,0.78]],[10]]      //`task_recover`, adjunct.wall --> update --> position[2] -->
                    ],
                ], 0, 1, 1],
                version:2025,
                short:0x00b8,
                code:"JAVASCRIPT_BASE64_CODE_STRING",
                source: "SOLANA_DATA_ACCOUNT",
                owner: "SOLANA_PDA_ACCOUNT_OF_BASIC_ADJUNCT",
            },
            box: {
                definition: {
                    "RESOURCE_ID_ON_CHAIN": 3,
                    "TEXTURE_REPEAT_SETTING": 4,
                    "ANIMATION_OPTION": 5,
                    "AUTO_STOP": 6,
                },
                sample:[[1.2,1.2,1.2],[8,8,2],[0,0,0],2,[2,2],0,0,1],
                version:2025,
                short:0x00a2,
                code:"JAVASCRIPT_BASE64_CODE_STRING",
                source: "SOLANA_DATA_ACCOUNT",
                owner: "ADJUNCT_OWNER",
            },
            module: {
                definition: {
                    "RESOURCE_ID_ON_CHAIN": 3,
                    "ANIMATION_OPTION": 4,
                    "AUTO_STOP": 5,
                },
                sample:[[3,4,3],[8,12,0],[0,0,0],27,0,1],
                version:2025,
                short:0x00a4,
                code:"JAVASCRIPT_BASE64_CODE_STRING",
                source: "SOLANA_DATA_ACCOUNT",
                owner: "ADJUNCT_OWNER",
            },
            wall: {
                definition: {
                    "RESOURCE_ID_ON_CHAIN": 3,
                    "TEXTURE_REPEAT_SETTING": 4,
                    "ANIMATION_OPTION": 5,
                    "AUTO_STOP": 6,
                    "INDEX_OF_HOLE": 7,
                },
                sample:[[1.5, 0.2, 0.5], [1, 0.3, 0], [0, 0, 0], 2, [1, 1], 0, 1],
                version:2025,
                short:0x00a1,
                code:"JAVASCRIPT_BASE64_CODE_STRING",
                source: "SOLANA_DATA_ACCOUNT",
                owner: "ADJUNCT_OWNER",
            },
        }
    },

    //common world setting
    common: () => {
        return {
            world: {     //Septopus setting
                name: "Septopus Worlds",          //Septopus的名称
                desc: "Septopus description.",   //Septopus世界的描述
                range: [4096, 4096],              //每个世界的尺寸 
                side: [16, 16, 64],             //单个block的尺寸限制
                max: 99,                          //最大世界发行数量
            },
            time: {      //time setting
                year: 12,        // months/year
                month: 30,       // days/month
                day: 24,         // hours/day
                hour: 60,        // minutes/hour
                minute: 60,      // seconds/minute
                second: 1000,    // microseconds/second
                speed: 20,       // rate =  septopus year / reality year
                start: 80000,    // septopus world start height
            },
            sky: {      //sky setting
                sun: 1,         //amount of sun
                moon: 3,        //amount of moon
            },
            weather: {  //Septopus weathe setting
                category: ["cloud", "rain", "snow"],
                grading: 8,
                detail: {
                    cloud: [
                        "sunny",              // ☀️ 完全晴朗
                        "mostly sunny",       // 🌤 几乎晴朗，少量云
                        "partly cloudy",      // ⛅️ 局部多云
                        "mostly cloudy",      // 🌥 大部分时间多云
                        "cloudy",             // ☁️ 完全多云
                        "overcast",           // 🌫️ 阴沉（厚云层）
                        "dim daylight",       // 🌁 光线暗淡（接近阴天或雾天）
                        "dark sky"            // 🌑 漆黑压抑的天空（重云/暴雨前）
                    ],
                    rain: [
                        "frog",              // 🐸 青蛙出没 / 极轻微湿气（象征刚下雨）
                        "drizzle",           // 🌦 细雨/毛毛雨
                        "light rain",        // 🌧 小雨
                        "moderate rain",     // 🌧 中雨
                        "heavy rain",        // 🌧🌧 大雨
                        "downpour",          // 🌧🌧🌧 倾盆大雨
                        "rainstorm",         // 🌩 雷雨或暴雨
                        "torrential rain"    // 🌊 特大暴雨，近灾害级
                    ],
                    snow: [
                        "frost",            // ❄️ 霜，极轻微结冰或冻露，非真正降雪
                        "flurries",         // 🌨️ 零星小雪
                        "light snow",       // 🌨 小雪
                        "moderate snow",    // 🌨 中雪
                        "heavy snow",       // 🌨🌨 大雪
                        "blowing snow",     // 🌬️❄️ 吹雪，风大雪大
                        "snowstorm",        // 🌨⚡️ 暴雪
                        "whiteout"          // 🌫️ 完全白茫茫，能见度极低
                    ],
                },
                degree: 40,
                data:{
                    category:[2,4],         //
                    grade:[10,6],
                    interval:3*60*60,       // 天气更新间隔       
                }
            },
        }
    },
    world: (index) => {
        return {
            name: `Septopus #${index} World`,      //World name
            desc: "One , a virtual block world on chain.",     //Description of world
            //range: [4096, 4096],        //limit of world 
            //side: [16, 16],             //size of block
            accuracy: 1000,             //accuracy, 1000 as 1mm. Default data as "m"
            block: {
                limit: [16, 16, 32],
                diff: 4,
                status: ["RAW", "PUBLIC", "PRIVATE", "LOCKED"],
            },
            address: "SOLANA_ACCOUNT_ADDRESS",      //signature of this world init
            blockheight: 1123456,                   //slot height when this world starts
            index: index,                       //index of world     
            adjunct: mock.adjunct(index),
            data:mock.single(index),
        };
    },
    single: (index) => {
        return {
            world: {
                desc: "",
                nickname: "",
                mode: [
                    "ghost",
                    "normal",
                    "game",
                ],
                accuracy: 1000,     //初始的显示尺寸支持。默认单位为m，这里是转换成mm来显示
                index: index,
            },
            block: {     //地块的world可配置的参数
                elevation: 0,       //初始海拔高度
                max: 30,            //单地块最大附属物数量
                color: 0x10b981,     //默认地块颜色
                texture: 2,          //默认地块贴图
            },
            player: {
                start: {
                    block: [2022, 617],         //玩家的默认启动位置
                    position: [8, 8, 0],      //默认开始的位置[x,y,z],z为站立高度(相对于block的高度)
                    rotation: [0.108, 0, 0],        //默认的旋转位置
                    world:0,
                    extend:4,              
                    stop:{
                        on:false,               //whether on stop ( including adjunct type )
                        adjunct:"",             //adjunct support stop attribution, need to figure out
                        index:0,                //adjunct index
                    }
                },
                body: {     //基础的玩家配置，如需特殊调整，用scale的方式来实现.Avatar里需要有这些参数，不存在的话，就用这个配置
                    //height: 1.7,        //默认玩家身高
                    shoulder: 0.5,      //肩膀宽度
                    chest: 0.22,        //胸部厚度
                    section: [0.3, 0.4, 0.2, 0.8],  //身体高度分段,[头部，身体，臀部，腿部]
                    head: [0.25, 0.05],           //头部的长度，[头高度，脖子]
                    hand: [0.2, 0.2, 0.1],         //手臂长度,[上臂，下臂，手]
                    leg: [0.5, 0.5, 0.1],          //腿的长度,[大腿，小腿，脚]
                },
                capacity: {     //玩家的运动能力（改成通过body进行计算）
                    //move: 0.03,          //move speed, meter/second
                    rotate: 0.05,        //rotate speed of head
                    //span: 0.31,          //max height of walking !important 这个后面需要根据玩家身体尺寸进行计算
                    //squat: 0.1,          //height of squat
                    //jump: 1,             //max height of jump
                    //death: 3,            //min height of fall death
                    //speed: 1.5,          //move speed, meter/second
                    strength: 1,         //strength time for jump. Not used yet.
                },
                bag: {           //游戏模式下的背包系统配置
                    max: 100,            //最大携带物品数量
                },
                avatar: {        //虚拟形象的配置
                    max: 2 * 1024 * 1024,        //虚拟形象文件的最大尺寸
                    scale: [2, 2, 2],        //虚拟形象身体尺寸的最大放大比例, [高,宽,深]
                },
            },
            extend:{
                news:{
                    server:"https://news_api.septopus.xyz",
                    methods:[
                        {
                            path:"list",
                            params:{
                                page:"number",
                                step:"number",
                            }
                        },
                        {
                            path:"view",
                            params:{
                                hash:"string[12]",
                            }
                        },
                        {
                            path:"comment",
                            params:{
                                hash:"string[12]",
                                words:"string[500]",
                            }
                        },
                    ]
                },
            },
        }
    },
    block: (x, y, world) => {
        return Design.show(x,y,world);
        //return Design.block(x,y,world);
    },

    content: (id) => {
        const txts=[
            "跌落死亡，请稍后再试",
            "我是触发器，被触发了哟。这段话是存在IPFS的哟",
            "欢迎来玩爬梯子的游戏，跑到顶就赢啦！",
        ]
        return {
            data:txts,
            format:"json",
            type:"text",
            more:{lang:"cn"},  
            index:id,                   //content index in contract counter
        }
    },
    texture: (id) => {
        const dt=Design.texture(id);
        if(dt!==false) return dt;

        const arr = [
            "texture/vbw.png",
            "texture/avatar.jpg",
            "texture/qr.png",
            "texture/grass.jpg",
            "texture/brick_bump.jpg",
            "texture/brick_diffuse.jpg",
            "texture/brick_roughness.jpg",
            "texture/crate.gif",
            "texture/disturb.jpg",
            "texture/water.jpg",
        ];
        return {
            index: id,
            type:"texture",
            format:"jpg",
            raw: arr[Toolbox.rand(0, arr.length - 2)],
            repeat: [1, 1]
        }
    },
    module: (id) => {
        const dt=Design.model(id);
        if(dt!==false) return dt;
        
        return {
            index: id,
            type:"module",
            format: ["3DS", "DAE", "FBX", "MMD"][Toolbox.rand(0, 3)],
            raw: "RAW_DATA_OF_3D_MODULE",
            params: {

            },
        }
    },
    //get on-chain resource by ID
    resource: (id) =>{
        if(id===999){
            return {
                index: id,
                type:"game",
                format:"json",
                raw:{
                    game:"running",
                    baseurl:"http://lcoalhost:9900",
                    homepage:"",
                    version:"1.0.1",
                    blocks:[                //Game load area. System will add extend 2 automatically
                        [2026,619,2,4],
                        [2027,624],
                    ],
                    methods:[
                        {
                            name:"start",
                            params:[],
                            response:[
                                {type:"string",length:12},
                            ],
                        },
                        {
                            name:"view",
                            params:[
                                {type:"number",limit:[0,255]},
                                {type:"string",limit:[0,30]},
                            ],
                            response:[
                                {key:"data",format:"string"},
                            ],
                        },
                    ],
                },
            }
        }

        return {
            index: id,
            type:"game",
            format:"json",
            raw:{
                
            }
        }
    },
}

export default mock;
