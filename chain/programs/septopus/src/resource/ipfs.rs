use {
    anchor_lang::prelude::*,
};

use crate::constants::{
    SOLANA_PDA_LEN,
    ResourceData,
    ResourceCounter,
    ResoureStatus,
    SPW_SEEDS_RESOURCE_DATA,
    SPW_SEEDS_RESOURCE_COUNT,
};

/********************************************************************/
/************************ Public Functions **************************/
/********************************************************************/

pub fn resource_add(
    ctx: Context<AddResource>,    //default from system
    index:u32,                  //module index
    ipfs:String,                //IPFS cid          
) -> Result<()> {
    msg!("index: {:?}", index);
    msg!("seed: {:?}", SPW_SEEDS_RESOURCE_DATA);
    msg!("index LE: {:?}", index.to_le_bytes());

    let clock = &ctx.accounts.clock;
    let create=clock.slot;

    let payer_pubkey = ctx.accounts.payer.key();
    let owner=payer_pubkey.to_string();
    
    let status=ResoureStatus::Created as u32;

    msg!("ipfs len: {}, owner len: {}", ipfs.len(), owner.len());

    *ctx.accounts.resource_data=ResourceData{
        ipfs,
        owner,
        create,
        status,
    };

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
pub struct AddResource<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    // #[account(mut,seeds = [SPW_SEEDS_RESOURE_MAP],bump)]
    // pub resource_map: Account<'info, ResourceMap>,

    #[account(
        init_if_needed,
        space = SOLANA_PDA_LEN + ResourceData::INIT_SPACE,     
        payer = payer,
        seeds = [
            SPW_SEEDS_RESOURCE_DATA,
            &index.to_le_bytes(),
        ],
        bump,
    )]
    pub resource_data: Account<'info, ResourceData>,

    #[account(mut,seeds = [SPW_SEEDS_RESOURCE_COUNT],bump)]
    pub module_counter: Account<'info, ResourceCounter>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}