use {
    anchor_lang::prelude::*,
};


use crate::constants::{
    BlockData,
    ResourceData,
    SPW_SEEDS_BLOCK_DATA,
    SPW_SEEDS_RESOURCE_DATA,
    ResoureStatus,
    BlockStatus,
    ErrorCode,
};

/********************************************************************/
/************************ Public Functions **************************/
/********************************************************************/

pub fn block(
    ctx: Context<RecoverBlock>,      //default from system
    _x:u32,                      
    _y:u32,
    _world:u32,
) -> Result<()> {

    //1. input check

    let clock = &ctx.accounts.clock;
    let bk= &mut ctx.accounts.block_data;
    bk.update=clock.slot;
    bk.status=BlockStatus::Public as u32;
    
    Ok(())
}

pub fn resource(
    ctx: Context<RecoverResource>,      //default from system                   
    index:u32,
) -> Result<()> {

    let res= &mut ctx.accounts.resource_data;
    res.status=ResoureStatus::Approved as u32;

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
#[instruction(x:u32,y:u32,world:u32)]
pub struct RecoverBlock<'info> {
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
#[instruction(index:u32)]
pub struct RecoverResource<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [
        SPW_SEEDS_RESOURCE_DATA,
        &index.to_le_bytes()
    ],bump)]
    pub resource_data: Account<'info, ResourceData>,
}