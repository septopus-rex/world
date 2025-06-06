use {
    std::str::FromStr,
    anchor_lang::prelude::*,
    serde_json::{Value},
};

use crate::constants::{
    SOLANA_PDA_LEN,
    WorldCounter,
    WorldList,
    WorldData,
    BlockData,
    ComplainData,
    SPW_SEEDS_WORLD_LIST,
    SPW_SEEDS_WORLD_COUNT,
    SPW_SEEDS_BLOCK_DATA,
    SPW_SEEDS_COMPLAIN_BLOCK,
    BlockStatus,
    ErrorCode,
};


/********************************************************************/
/************************ Public Functions **************************/
/********************************************************************/

pub fn mint(
    ctx: Context<MintBlock>,      //default from system
    x:u32,                      
    y:u32,
    world:u32,
) -> Result<()> {
    msg!("world {} localtion: [{},{}]", world,x,y);
    msg!("seed: {:?}", SPW_SEEDS_BLOCK_DATA);
    msg!("x: {:?}", x.to_le_bytes());
    msg!("y: {:?}", y.to_le_bytes());
    msg!("world: {:?}", world.to_le_bytes());
    //1. input check
    //1.1 wether world is on sell
    let world_list=&mut ctx.accounts.world_list;
    if world_list.list.len()-1 != world as usize {
        return Err(error!(ErrorCode::InvalidWorldIndex));
    }

    //1.2 wether X or Y overflow
    if !is_valid_location(x,y,&world_list.list[world as usize]) {
        return Err(error!(ErrorCode::InvalidLocation));
    }

    //2. logical check
    //2.1. minted already
    let acc=&ctx.accounts.block_data;
    if acc.create != 0 {
        return Err(error!(ErrorCode::BlockIsMinted));
    }

    //3. init block
    let clock = &ctx.accounts.clock;
    let payer_pubkey = ctx.accounts.payer.key();

    let data=String::from("[]");
    let owner=payer_pubkey.to_string();
    let price:u64=0;
    let create=clock.slot.clone();
    let update=clock.slot;
    let status=BlockStatus::Public as u32;
    *ctx.accounts.block_data= BlockData{
        data,
        owner,
        price,
        create,
        update,
        status
    };

    //4.inc minted amount
    let minted = &mut ctx.accounts.world_counter;
    minted.inc();

    Ok(())
}

pub fn update(
    ctx: Context<UpdateBlock>,      //default from system
    x:u32,                      
    y:u32,
    world:u32,
    data:String,                 //block data storaged on chain
)-> Result<()> {

    //1. input check
    //1.1 wether world is on sell
    // let world_list=&mut ctx.accounts.world_list;
    // if world_list.list.len()-1 != world as usize {
    //     return Err(error!(ErrorCode::InvalidWorldIndex));
    // }

    //1.2 wether X or Y overflow
    // if !is_valid_location(x,y,&world_list.list[world as usize]) {
    //     return Err(error!(ErrorCode::InvalidLocation));
    // }

    //1.3 wether owner of block
    // let check_key = ctx.accounts.payer.key();
    // if is_owner(check_key,&ctx.accounts.block_data.owner) {
    //     return Err(error!(ErrorCode::NotOwnerOfBlock));
    // }

    //2. update the account address on block
    let clock = &ctx.accounts.clock;
    let bk= &mut ctx.accounts.block_data;
    //bk.data=data;
    bk.update=clock.slot;
    Ok(())
}


pub fn sell(
    ctx: Context<SellBlock>,      //default from system
    _x:u32,                      
    _y:u32,
    _world:u32,
    price:u64,                      //Selling price in SOL
) -> Result<()> {

    //1. input check

    let clock = &ctx.accounts.clock;
    let bk= &mut ctx.accounts.block_data;
    bk.price=price;
    bk.update=clock.slot;
    bk.status=BlockStatus::Selling as u32;            //FIXME, here to set an enum to select

    Ok(())
}

pub fn buy(
    ctx: Context<BuyBlock>,      //default from system
    _x:u32,                      
    _y:u32,
    _world:u32,
) -> Result<()> {

    //1. input check

    let payer_pubkey = ctx.accounts.payer.key();
    let owner=payer_pubkey.to_string();

    let clock = &ctx.accounts.clock;

    let bk= &mut ctx.accounts.block_data;
    bk.owner=owner;
    bk.update=clock.slot;
    bk.price=0;

    Ok(())
}


pub fn withdraw(
    ctx: Context<WithdrawBlock>,      //default from system
    _x:u32,                      
    _y:u32,
    _world:u32,
) -> Result<()> {

    //1. input check

    // let payer_pubkey = ctx.accounts.payer.key();
    // let owner=payer_pubkey.to_string();

    let clock = &ctx.accounts.clock;

    let bk= &mut ctx.accounts.block_data;
    bk.update=clock.slot;
    bk.price=0;

    Ok(())
}


/********************************************************************/
/*********************** Private Functions **************************/
/********************************************************************/


fn is_owner(check_pubkey:Pubkey,record:&str) -> bool{
    let pubkey = solana_program::pubkey::Pubkey::from_str(record).expect("Invalid pubkey");
    let pubkey_bytes: [u8; 32] = pubkey.to_bytes();
    let manage_pubkey = anchor_lang::prelude::Pubkey::new_from_array(pubkey_bytes);
    if check_pubkey != manage_pubkey {
        return false;
    }
    return true;
}


fn is_account_initialized(account_info: &AccountInfo) -> bool {
    account_info.lamports() > 0
}

fn is_valid_location(x:u32, y:u32, single:&WorldData) -> bool{
    let whole: Value = match serde_json::from_str(&single.data) {
        Ok(json) => json,
        Err(_) => return false,
    };
    if let Some(arr) = whole.get("size") {
        let size = arr.as_array().unwrap();
        if x > size[0].as_u64().unwrap() as u32 || y > size[1].as_u64().unwrap() as u32 {
            return false;
        }
    }else{
        return false;
    }
    return true;
}

///!important, do not add payer.publickey as one of seeds. Need to sell/buy.
///!important, added "owner" in data struct, check that to confirm ownership.

/********************************************************************/
/************************* Data Structure ***************************/
/********************************************************************/

#[derive(Accounts)]
#[instruction(x:u32,y:u32,world:u32)]
pub struct MintBlock<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        space = SOLANA_PDA_LEN + BlockData::INIT_SPACE,
        payer = payer,
        seeds = [
            SPW_SEEDS_BLOCK_DATA,
            &x.to_le_bytes(),
            &y.to_le_bytes(),
            &world.to_le_bytes(),
        ],
        bump,
    )]
    pub block_data: Account<'info, BlockData >,

    #[account(
        init_if_needed,
        space = SOLANA_PDA_LEN + WorldCounter::INIT_SPACE,     
        payer = payer,
        seeds = [
            SPW_SEEDS_WORLD_COUNT,
            &world.to_le_bytes(),
        ],
        bump,
    )]
    pub world_counter: Account<'info, WorldCounter>,

    #[account(mut,seeds = [SPW_SEEDS_WORLD_LIST],bump)]
    pub world_list: Account<'info, WorldList>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(x:u32,y:u32,world:u32,data:String)]
pub struct UpdateBlock<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [
        SPW_SEEDS_BLOCK_DATA,
        &x.to_le_bytes(),
        &y.to_le_bytes(),
        &world.to_le_bytes(),
    ],bump)]
    pub block_data: Account<'info, BlockData>,

    #[account(mut,seeds = [SPW_SEEDS_WORLD_LIST],bump)]
    pub world_list: Account<'info, WorldList>,

    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(x:u32,y:u32,world:u32,price:u32)]
pub struct SellBlock<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [
        SPW_SEEDS_BLOCK_DATA,
        &x.to_le_bytes(),
        &y.to_le_bytes(),
        &world.to_le_bytes(),
    ],bump)]
    pub block_data: Account<'info, BlockData>,

    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(x:u32,y:u32,world:u32)]
pub struct BuyBlock<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [
        SPW_SEEDS_BLOCK_DATA,
        &x.to_le_bytes(),
        &y.to_le_bytes(),
        &world.to_le_bytes(),
    ],bump)]
    pub block_data: Account<'info, BlockData>,

    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(x:u32,y:u32,world:u32)]
pub struct WithdrawBlock<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [
        SPW_SEEDS_BLOCK_DATA,
        &x.to_le_bytes(),
        &y.to_le_bytes(),
        &world.to_le_bytes(),
    ],bump)]
    pub block_data: Account<'info, BlockData>,

    pub clock: Sysvar<'info, Clock>,
}