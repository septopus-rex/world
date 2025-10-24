use {
    anchor_lang::prelude::*,
};


use crate::constants::{
    BlockData,
    ComplainData,
    SPW_SEEDS_BLOCK_DATA,
    SPW_SEEDS_COMPLAIN_RESOURCE,
    SPW_SEEDS_COMPLAIN_BLOCK,
    SOLANA_PDA_LEN,
};

/********************************************************************/
/************************ Public Functions **************************/
/********************************************************************/

pub fn block(
    ctx: Context<ComplainBlock>,      //default from system
    _x:u32,                      
    _y:u32,
    _world:u32,
    complain:String,                     //complain JSON string
) -> Result<()> {

    //1. input check
    let clock = &ctx.accounts.clock;
    let category=1;
    let result=String::from("{}");
    let create=clock.slot;
    *ctx.accounts.complain_data= ComplainData{
        category,
        complain,
        result,
        create,
    };


    Ok(())
}

pub fn resource(
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
pub struct ComplainBlock<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [
        SPW_SEEDS_BLOCK_DATA,
        &x.to_le_bytes(),
        &y.to_le_bytes(),
        &world.to_le_bytes(),
    ],bump)]
    pub block_data: Account<'info, BlockData>,

    #[account(
        init,
        space = SOLANA_PDA_LEN + ComplainData::INIT_SPACE,     
        payer = payer,
        seeds = [
            SPW_SEEDS_COMPLAIN_BLOCK,    //need to set [u8;4] to avoid error
            &x.to_le_bytes(),
            &y.to_le_bytes(),
            &world.to_le_bytes(),
        ],
        bump,
    )]
    pub complain_data: Account<'info, ComplainData>,

    pub system_program: Program<'info, System>,

    pub clock: Sysvar<'info, Clock>,
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