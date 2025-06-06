use {
    anchor_lang::prelude::*,
};

use crate::constants::{
    SOLANA_PDA_LEN,
    ResourceData,
    ResourceCounter,
    ResoureStatus,
    ComplainData,
    SPW_SEEDS_RESOURCE_DATA,
    SPW_SEEDS_RESOURCE_COUNT,
    SPW_SEEDS_COMPLAIN_RESOURCE,
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

pub fn resource_approve(
    ctx: Context<ApproveResource>,      //default from system                   
    _index:u32,
) -> Result<()> {

    let res= &mut ctx.accounts.resource_data;
    res.status=ResoureStatus::Approved as u32;

    Ok(())
}

pub fn resource_complain(
    ctx: Context<ComplainResource>,      //default from system
    index:u32,
    complain:String,                   //complain JSON string        
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


pub fn resource_recover(
    ctx: Context<RecoverResource>,      //default from system                   
    _index:u32,
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


#[derive(Accounts)]
#[instruction(index:u32)]
pub struct ApproveResource<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [
        SPW_SEEDS_RESOURCE_DATA,
        &index.to_le_bytes()
    ],bump)]
    pub resource_data: Account<'info, ResourceData>,
}

#[derive(Accounts)]
#[instruction(index:u32)]
pub struct ComplainResource<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        space = SOLANA_PDA_LEN + ComplainData::INIT_SPACE,     
        payer = payer,
        seeds = [
            SPW_SEEDS_COMPLAIN_RESOURCE,      //need to set [u8;4] to avoid error
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
pub struct RecoverResource<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [
        SPW_SEEDS_RESOURCE_DATA,
        &index.to_le_bytes()
    ],bump)]
    pub resource_data: Account<'info, ResourceData>,
}
