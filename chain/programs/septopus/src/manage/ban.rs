use {
    //std::str::FromStr,
    anchor_lang::prelude::*,
    //anchor_lang::system_program,
};

use crate::constants::{
    BlockData,
    ResourceData,
    SPW_SEEDS_BLOCK_DATA,
    SPW_SEEDS_RESOURCE_DATA,
    BlockStatus,
    ResoureStatus,
    ErrorCode,
};

/********************************************************************/
/************************ Public Functions **************************/
/********************************************************************/

pub fn block(
    ctx: Context<BanBlock>,      //default from system
    _x:u32,
    _y:u32,
    _world:u32,
) -> Result<()> { 

    let clock = &ctx.accounts.clock;
    let bk= &mut ctx.accounts.block_data;
    bk.update=clock.slot;
    bk.status=BlockStatus::Banned as u32;

    Ok(())
}

// pub fn texture(
//     ctx: Context<BanTexture>,      //default from system
//     _index: u32,
// ) -> Result<()> { 

//     let texture= &mut ctx.accounts.texture_data;
//     texture.status=ResoureStatus::Banned as u32;

//     Ok(())
// }

// pub fn module(
//     ctx: Context<BanModule>,      //default from system
//     _index: u32,
// ) -> Result<()> {  
//     let module= &mut ctx.accounts.module_data;
//     module.status=ResoureStatus::Banned as u32;

//     Ok(())
// }

pub fn resource(
    ctx: Context<BanResource>,      //default from system
    _index: u32,
) -> Result<()> {  
    let res= &mut ctx.accounts.resource_data;
    res.status=ResoureStatus::Banned as u32;

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
pub struct BanBlock<'info> {
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

// #[derive(Accounts)]
// #[instruction(index:u32)]
// pub struct BanTexture<'info> {
//     #[account(mut)]
//     pub payer: Signer<'info>,

//     #[account(mut,seeds = [
//         SPW_SEEDS_TEXTURE_DATA,
//         &index.to_le_bytes(),
//     ],bump)]
//     pub texture_data: Account<'info, TextureData>,
// }

// #[derive(Accounts)]
// #[instruction(index:u32)]
// pub struct BanModule<'info> {
//     #[account(mut)]
//     pub payer: Signer<'info>,

//     #[account(mut,seeds = [
//         SPW_SEEDS_MODULE_DATA,
//         &index.to_le_bytes(),
//     ],bump)]
//     pub module_data: Account<'info, ModuleData>,
// }

#[derive(Accounts)]
#[instruction(index:u32)]
pub struct BanResource<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [
        SPW_SEEDS_RESOURCE_DATA,
        &index.to_le_bytes(),
    ],bump)]
    pub resource_data: Account<'info, ResourceData>,
}