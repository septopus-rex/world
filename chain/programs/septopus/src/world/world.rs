use {
    //std::str::FromStr,
    anchor_lang::prelude::*,
    //anchor_lang::system_program,
    serde_json::{json, Value},

};

use crate::constants::{
    SOLANA_PDA_LEN,
    SPW_WORLD_LIST_SIZE,
    SPW_RESOURE_MAP_SIZE,
    SPW_WHITELIST_MAP_SIZE,
    WorldList,
    WhiteList,
    WorldData,
    WorldCounter,
    ResourceCounter,
    SPW_SEEDS_WORLD_LIST,
    SPW_SEEDS_WHITE_LIST,
    SPW_SEEDS_WORLD_COUNT,
    SPW_SEEDS_RESOURCE_COUNT,
    ErrorCode,
};

/********************************************************************/
/************************ Public Functions **************************/
/********************************************************************/


pub fn init(
    ctx: Context<InitSPW>,     //default from system
    root:String,               //root address
    recipient:String,
) -> Result<()> {   

    //1. create world necessary accounts.
    //1.1. world list 
    //1.2. texture counter
    //1.3. module counter
    //1.4. adjunct map

    //2. create management accounts.
    //2.1. whitelist of manage for whole system. ( ban texture, ban module ) 
    let white = &mut ctx.accounts.whitelist_account;
    white.push(root.clone());
    white.recipient(recipient);
    white.replace(root);

    let value:u64=0;
    *ctx.accounts.resource_counter= ResourceCounter{
        value
    };

    //2.2. whitelist of manage for single world. ( ban block )
    // let whitelist = &mut ctx.accounts.white_account;

    Ok(())
}

pub fn start(
    ctx: Context<NewWorld>,    //default from system
    index:u32,                  //index of world to  start
    data:String,                //world setting as JSON format
) -> Result<()> {

    //0. input check
    //0.1. wether valid index.
    let world_list=&mut ctx.accounts.world_list;
    if world_list.list.len() != index as usize {
        return Err(error!(ErrorCode::InvalidWorldIndex));
    }
    
    //0.2. wether valid setting.

    //1. logical check
    //1.1. ready to start new world.
    
    let white = &mut ctx.accounts.whitelist_account;

    
    //2. create world accounts
    //2.1. world sold counter

    //3. write world setting
    //3.1. update new world setting
    //3.2. close the update of old world

    
    let clock = &ctx.accounts.clock;
    let start:u64=clock.slot;
    let close:u64=0;
    let adjunct=String::from("[]");
    let n_world=WorldData{
        data,
        adjunct,
        start,
        close
    };
    world_list.add(n_world);

    Ok(())
}

pub fn adjunct(
    ctx: Context<WorldAdjunct>,    //default from system
    index: u32,                    //index of world to  start
    short: u32,                    //adjunct unique index
    name: String,                  //adjunct name
    format: String,
) -> Result<()> {
    //0. input check
    //0.1. index check
    //0.2. short limit
    //0.3. name limit 

    let world_list=&mut ctx.accounts.world_list;
    world_list.adjunct(index,short,name,format);
    
    Ok(())
}

/********************************************************************/
/*********************** Private Functions **************************/
/********************************************************************/

// fn is_valid_name() -> bool{
//     return true;
// }


/********************************************************************/
/************************* Data Structure ***************************/
/********************************************************************/

#[derive(Accounts)]
pub struct InitSPW<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /**************************************/
    /************ PDA accounts ************/
    /**************************************/

    #[account(
        init,
        space = SOLANA_PDA_LEN + SPW_WHITELIST_MAP_SIZE, 
        payer = payer,
        seeds = [SPW_SEEDS_WHITE_LIST],
        bump,
    )]
    pub whitelist_account: Account<'info, WhiteList>,

    //FIXME, need to relocate the size of `world_list` in final version
    #[account(
        init,
        space = SOLANA_PDA_LEN + SPW_WORLD_LIST_SIZE,     
        payer = payer,
        seeds = [SPW_SEEDS_WORLD_LIST],
        bump,
    )]
    pub world_list: Account<'info, WorldList>,

    #[account(
        init,
        space = SOLANA_PDA_LEN + ResourceCounter::INIT_SPACE,
        payer = payer,
        seeds = [SPW_SEEDS_RESOURCE_COUNT],
        bump,
    )]
    pub resource_counter: Account<'info, ResourceCounter>,

    pub system_program: Program<'info, System>,
    
}

#[derive(Accounts)]
#[instruction(index:u32)]
pub struct NewWorld<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    //WorldCounter, if needed.
    #[account(
        init,
        space = SOLANA_PDA_LEN + WorldCounter::INIT_SPACE, 
        payer = payer,
        seeds = [
            SPW_SEEDS_WORLD_COUNT,
            &index.to_le_bytes()
        ],
        bump,
    )]
    pub world_counter: Account<'info, WorldCounter>,

    #[account(mut,seeds = [SPW_SEEDS_WHITE_LIST],bump)]
    pub whitelist_account: Account<'info, WhiteList>,

    #[account(mut,seeds = [SPW_SEEDS_WORLD_LIST],bump)]
    pub world_list: Account<'info, WorldList>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(index:u32)]
pub struct WorldAdjunct<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [SPW_SEEDS_WORLD_LIST],bump)]
    pub world_list: Account<'info, WorldList>,

    #[account(mut,seeds = [SPW_SEEDS_WHITE_LIST],bump)]
    pub whitelist_account: Account<'info, WhiteList>,
}
