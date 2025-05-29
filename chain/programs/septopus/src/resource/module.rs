use {
    //std::str::FromStr,
    anchor_lang::prelude::*,
    //anchor_lang::system_program,
};
use md5;

use crate::constants::{
    SOLANA_PDA_LEN,
    ModuleData,
    ComplainData,
    ModuleCounter,
    SPW_SEEDS_MODULE_DATA,
    SPW_SEEDS_COMPLAIN_MODULE,
    SPW_SEEDS_MODULE_COUNT,
    ResoureStatus,
    ErrorCode,
};

/********************************************************************/
/************************ Public Functions **************************/
/********************************************************************/

pub fn module_add(
    ctx: Context<AddModule>,    //default from system
    index:u32,                  //module index
    ipfs:String,                //IPFS cid          
) -> Result<()> {
    msg!("index: {:?}", index);
    msg!("seed: {:?}", SPW_SEEDS_MODULE_DATA);
    msg!("index LE: {:?}", index.to_le_bytes());

    let clock = &ctx.accounts.clock;
    let payer_pubkey = ctx.accounts.payer.key();
    let owner=payer_pubkey.to_string();
    let create=clock.slot;
    let status=ResoureStatus::Created as u32;

    msg!("ipfs len: {}, owner len: {}", ipfs.len(), owner.len());

    *ctx.accounts.module_data=ModuleData{
        ipfs,
        owner,
        create,
        status,
    };

    Ok(())
}


pub fn module_approve(
    ctx: Context<ApproveModule>,      //default from system                   
    _index:u32,
) -> Result<()> {

    let module= &mut ctx.accounts.module_data;
    module.status=ResoureStatus::Approved as u32;

    Ok(())
}

pub fn module_complain(
    ctx: Context<ComplainModule>,      //default from system
    _index:u32,
    complain:String,                     //complain JSON string        
) -> Result<()> {

    // let clock = &ctx.accounts.clock;
    // let category=1;
    // let result=String::from("{}");
    // let create=clock.slot;
    // *ctx.accounts.complain_data= ComplainData{
    //     category,
    //     complain,
    //     result,
    //     create,
    // };
    
    Ok(())
}

pub fn module_recover(
    ctx: Context<RecoverModule>,      //default from system                   
    _index:u32,
) -> Result<()> {

    let module= &mut ctx.accounts.module_data;
    module.status=ResoureStatus::Approved as u32;

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
#[instruction(index:u32)]
pub struct ReplaceModule<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        space = SOLANA_PDA_LEN + ModuleData::INIT_SPACE,     
        payer = payer,
        seeds = [
            SPW_SEEDS_MODULE_DATA,
            &index.to_le_bytes(),
        ],
        bump,
    )]
    pub module_data: Account<'info, ModuleData>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(index:u32)]
pub struct AddModule<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    // #[account(mut,seeds = [SPW_SEEDS_RESOURE_MAP],bump)]
    // pub resource_map: Account<'info, ResourceMap>,

    #[account(
        init_if_needed,
        space = SOLANA_PDA_LEN + ModuleData::INIT_SPACE,     
        payer = payer,
        seeds = [
            SPW_SEEDS_MODULE_DATA,
            &index.to_le_bytes(),
        ],
        bump,
    )]
    pub module_data: Account<'info, ModuleData>,

    #[account(mut,seeds = [SPW_SEEDS_MODULE_COUNT],bump)]
    pub module_counter: Account<'info, ModuleCounter>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(index:u32)]
pub struct ApproveModule<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [
        SPW_SEEDS_MODULE_DATA,
        &index.to_le_bytes()
    ],bump)]
    pub module_data: Account<'info, ModuleData>,
}


#[derive(Accounts)]
#[instruction(index:u32)]
pub struct ComplainModule<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        space = SOLANA_PDA_LEN + ComplainData::INIT_SPACE,     
        payer = payer,
        seeds = [
            SPW_SEEDS_COMPLAIN_MODULE,      //need to set [u8;4] to avoid error
            &index.to_le_bytes(),
        ],
        bump,
    )]
    pub complain_data: Account<'info, ComplainData>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(index:u32)]
pub struct RecoverModule<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [
        SPW_SEEDS_MODULE_DATA,
        &index.to_le_bytes()
    ],bump)]
    pub module_data: Account<'info, ModuleData>,
}