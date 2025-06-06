use {
    anchor_lang::prelude::*,
};

use crate::constants::{
    ResourceData,
    SPW_SEEDS_RESOURCE_DATA,
    ResoureStatus,
    ErrorCode,
};

/********************************************************************/
/************************ Public Functions **************************/
/********************************************************************/

pub fn resource(
    ctx: Context<ApproveResource>,      //default from system                   
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
/********************************************************************/#[derive(Accounts)]
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