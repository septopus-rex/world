use anchor_lang::prelude::*;
use serde_json::{json, Value};

/********************************************************************/
/*********************** Static Parameters **************************/
/********************************************************************/

///Accounts space setting
pub const ANCHOR_DESCRIMINATOR_SIZE: usize = 8;
pub const SOLANA_PDA_LEN:usize=8;
pub const SPW_WHITELIST_MAP_SIZE:usize=500;     //whitelist map size
pub const SPW_WORLD_LIST_SIZE:usize=800; 
pub const SPW_RESOURE_MAP_SIZE:usize=1200; 
pub const SPW_TEXTURE_LIST_SIZE:usize=3000;
pub const SPW_MODULE_LIST_SIZE:usize=3600;

///System setting
pub const SPW_ROOT_ACCOUNT:&str="GTNgXEzmG2E2d9yX8fwueP4bD2WCgJ3mqvt7sQj6CYYr"; //root of VBW program

///World setting
pub const SPW_WORLD_MAX:u32= 99;              //offset to get the block hash

///Block setting
pub const SPW_BLOCK_INIT_PRICE:u64= 1_000_000;      // 0.01 SOL, the block init price.

///PDA accounts seeds
pub const SPW_SEEDS_WHITE_LIST:&[u8;5]=b"white";
pub const SPW_SEEDS_WORLD_LIST:&[u8;6]=b"worlds";
pub const SPW_SEEDS_BLOCK_DATA:&[u8;4]=b"b_dt";
pub const SPW_SEEDS_WORLD_COUNT:&[u8;4]=b"w_ct";
pub const SPW_SEEDS_TEXTURE_COUNT:&[u8;4]=b"c_tx";
pub const SPW_SEEDS_MODULE_COUNT:&[u8;4]=b"c_md";
pub const SPW_SEEDS_TEXTURE_DATA:&[u8;4]=b"d_xx";
pub const SPW_SEEDS_MODULE_DATA:&[u8;4]=b"m_yz";
pub const SPW_SEEDS_COMPLAIN_TEXTURE:&[u8;4]=b"cptx";
pub const SPW_SEEDS_COMPLAIN_MODULE:&[u8;4]=b"cpmd";
pub const SPW_SEEDS_COMPLAIN_BLOCK:&[u8;4]=b"cpbk";

pub const SPW_SEEDS_TEXTURE_LIST:&[u8;7]=b"texture";
pub const SPW_SEEDS_MODULE_LIST:&[u8;6]=b"module";
pub const SPW_SEEDS_RESOURE_MAP:&[u8;6]=b"resmap";

/********************************************************************/
/************************* World Related ****************************/
/********************************************************************/

//single VBW world setting
#[account]
pub struct WorldList {
    pub list:Vec<WorldData>,
}
impl WorldList {
    //add new world to world list
    pub fn add(&mut self, data:WorldData) {
        self.list.push(data)
    }

    //when all blocks are sold out, close the world
    pub fn close(&mut self) {
        
    }

    pub fn adjunct(&mut self, index:u32, short:u32, name:String, format:String) {

        //1.get adjunct data;
        let world_data = &mut self.list[index as usize];
        if world_data.adjunct.is_empty(){
            return ();
        }
        let mut adjunct_data: Value = match serde_json::from_str(&world_data.adjunct) {
            Ok(json) => json,
            Err(_) => return (),
        };

        //2.check wether name or short exsist
        // for s in adjunct_data {
        //     if let Some(s_arr) = s.as_array() {
        //         if s_arr.len() != 2 
        //             || !s_arr[0].is_string() 
        //             || !s_arr[1].is_string() {
        //             return false;
        //         }
        //     } else {
        //         return false;
        //     }
        // }


        //3.format data to save
        let arr_format:Value= match serde_json::from_str(&format) {
            Ok(json) => json,
            Err(_) => return (),
        };
        let new_entry = json!([short, name, arr_format]);
        if let Some(arr) = adjunct_data.as_array_mut() {
            arr.push(new_entry);
        }

        let adjunct_final = match serde_json::to_string(&adjunct_data) {
            Ok(result) => result,
            Err(_) => return  (),
        };

        world_data.adjunct=adjunct_final
    }
}

#[account]
#[derive(InitSpace)]
pub struct WorldData {
    #[max_len(500)]         
    pub data: String,       //JSON world setting
    #[max_len(3000)]
    pub adjunct:String,     //adjunct setting
    pub start: u64,         //world start slot height
    pub close: u64,         //all blocks are sold out slot height
}

//the total supply of LUCK token
#[account]
#[derive(InitSpace)]
pub struct WorldCounter {
    pub value: u32,
}
impl WorldCounter {
    pub fn inc(&mut self) {
        self.value += 1
    }

    ///!important, only on Devnet
    //FIXME, DEBUG only, need to remove when deploy on mainnet
    pub fn set(&mut self, amount:u32) {
        self.value = amount
    }

    ///!important, only on Devnet
    //FIXME, DEBUG only, need to remove when deploy on mainnet
    pub fn max(&mut self) {
        self.value = 4096 * 4096
    }
}


/********************************************************************/
/************************* Block Related ****************************/
/********************************************************************/

//single VBW block setting
#[account]
#[derive(InitSpace)]
pub struct BlockData {
    #[max_len(80)] 
    pub data: String,
    #[max_len(50)] 
    pub owner: String,              //owner of block 
    pub price: u64,                 //selling price
    pub create: u64,                //create slot height
    pub update: u64,                //last update slot height
    pub status: u32,                //block status enum BlockStatus
}

/********************************************************************/
/************************ Resource Related **************************/
/********************************************************************/

#[account]
#[derive(InitSpace)]
pub struct ResourceFootprint {
    exsist:bool,        //wether init
    stamp:u64,          //slot height
}

//single module data struct
#[account]
#[derive(InitSpace)]
pub struct ModuleData {
    #[max_len(100)]
    pub ipfs:String,     //Module IPFS cid
    #[max_len(50)] 
    pub owner:String,    //creator of module 
    pub create: u64,     //create slot height
    pub status: u32,      //block status  ["created","approved","banned"]
}

#[account]
#[derive(InitSpace)]
pub struct ModuleCounter {
    pub value: u64,
}
impl ModuleCounter {
    pub fn inc(&mut self, amount:u64) {
        self.value += amount
    }

    ///!important, only on Devnet
    //FIXME, DEBUG only, need to remove when deploy on mainnet
    pub fn set(&mut self, amount:u64) {
        self.value = amount
    }

    ///!important, only on Devnet
    //FIXME, DEBUG only, need to remove when deploy on mainnet
    pub fn max(&mut self) {
        self.value = 4096 * 4096
    }
}

//single texture data struct
#[account]
#[derive(InitSpace)]
pub struct TextureData {
    #[max_len(80)] 
    pub ipfs: String,     //JSON world setting
    #[max_len(50)] 
    pub owner: String,    //creator of gene to accept token
    pub create: u64,      //create slot height
    pub status: u32,      //block status  ["created","approved","banned"]
}

#[account]
#[derive(InitSpace)]
pub struct TextureCounter {
    pub value: u64,
}
impl TextureCounter {
    pub fn inc(&mut self, amount:u64) {
        self.value += amount
    }

    ///!important, only on Devnet
    //FIXME, DEBUG only, need to remove when deploy on mainnet
    pub fn set(&mut self, amount:u64) {
        self.value = amount
    }

    ///!important, only on Devnet
    //FIXME, DEBUG only, need to remove when deploy on mainnet
    pub fn max(&mut self) {
        self.value = 4096 * 4096
    }
}

/********************************************************************/
/*********************** Resource Related ***************************/
/********************************************************************/

//whitelist of managers, allow to manage the world
#[account]
pub struct WhiteList{
    pub data: Vec<String>,          //manager list
    pub recipient:String,           //fee recipient
    pub root:String,                //VBW root manage account
}

impl WhiteList {
    pub fn push(&mut self, manager:String) {
        self.data.push(manager)
    }

    pub fn replace(&mut self, root:String) {
        self.root = root
    }
    
    pub fn remove(&mut self,manager:String) {
        self.data.retain(|p| p != &manager);
    }

    pub fn recipient(&mut self,recipient:String){
        self.recipient = recipient
    }
}

#[account]
#[derive(InitSpace)]
pub struct ComplainData {
    pub category: u32,          //["block","texture","module"]
    #[max_len(200)]
    pub complain: String,   
    #[max_len(200)]
    pub result:String, 
    pub create: u64,        //create slot height
}

#[repr(u32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockStatus {
    Public = 0,
    Private = 1,
    Selling = 2,
    Banned = 3,
    Locked = 4,
}

#[repr(u32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResoureStatus {
    Created = 0,
    Approved = 1,
    Banned = 2,
}

#[repr(u32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ComplainCategory {
    Block = 0,
    Texture = 1,
    Module = 2,
}

#[error_code]
pub enum ErrorCode {
    #[msg("System is inited already.")]
    AlreadyInited,

    #[msg("Invalid index to start new world.")]
    InvalidWorldIndex,

    #[msg("Invalid JSON format.")]
    InvalidJSON,

    #[msg("Failed to stringify JSON.")]
    FailedToString,

    #[msg("Block is minted, please try another one.")]
    BlockIsMinted,

    #[msg("Invalid block location.")]
    InvalidLocation,

    #[msg("Not the owner of this block.")]
    NotOwnerOfBlock,
}
