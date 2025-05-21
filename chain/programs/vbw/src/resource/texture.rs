use {
    anchor_lang::prelude::*,
};

use crate::constants::{
    SOLANA_PDA_LEN,
    TextureData,
    TextureCounter,
    ComplainData,
    VBW_SEEDS_TEXTURE_COUNT,
    VBW_SEEDS_TEXTURE_DATA,
    VBW_SEEDS_COMPLAIN_TEXTURE,
    ResoureStatus,
    ErrorCode,
};

/********************************************************************/
/************************ Public Functions **************************/
/********************************************************************/

pub fn texture_new(
    ctx: Context<NewTexture>,
    id:u32,
    data:String,
)-> Result<()> {
    

    Ok(())
}

pub fn texture_approve(
    ctx: Context<ApproveTexture>, 
    _index:u32,                      //texture index in queue
) -> Result<()> {

    // let texture= &mut ctx.accounts.texture_data;
    // texture.status=ResoureStatus::Approved as u32;

    //#[instruction(xx:u32,data:String)]

    Ok(())
}

pub fn texture_complain(
    ctx: Context<ComplainTexture>, //default from system
    _index:u32,                      //texture index in queue
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

pub fn texture_recover(
    ctx: Context<RecoverTexture>,      //default from system
    _index:u32,                    //texture index in queue
) -> Result<()> {

    let texture= &mut ctx.accounts.texture_data;
    texture.status=ResoureStatus::Approved as u32;
    
    Ok(())
}


/********************************************************************/
/*********************** Private Functions **************************/
/********************************************************************/

// fn is_manage_account() -> bool{
//     return true;
// }


/********************************************************************/
/************************* Data Structure ***************************/
/********************************************************************/

#[derive(Accounts)]
#[instruction(id:u32)]
pub struct NewTexture<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        space = SOLANA_PDA_LEN + TextureData::INIT_SPACE,     
        payer = payer,
        seeds = [
            VBW_SEEDS_TEXTURE_DATA,
            //&id.to_le_bytes(),              //FIXME, can work after ignore this
        ],
        bump,
    )]
    pub texture_data: Account<'info, TextureData>,

    #[account(mut,seeds = [VBW_SEEDS_TEXTURE_COUNT],bump)]
    pub texture_counter: Account<'info, TextureCounter>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}
  

#[derive(Accounts)]
#[instruction(index:u32)]
pub struct ApproveTexture<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [
        VBW_SEEDS_TEXTURE_DATA,
        //&index.to_le_bytes()
    ],bump)]
    pub texture_data: Account<'info, TextureData>,
}


#[derive(Accounts)]
#[instruction(index:u32)]
pub struct ComplainTexture<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [
        VBW_SEEDS_TEXTURE_DATA,
        //&index.to_le_bytes()
    ],bump)]
    pub texture_data: Account<'info, TextureData>,

    #[account(
        init,
        space = SOLANA_PDA_LEN + ComplainData::INIT_SPACE,     
        payer = payer,
        seeds = [
            VBW_SEEDS_COMPLAIN_TEXTURE,      //need to set [u8;4] to avoid error
            //&index.to_le_bytes(),
        ],
        bump,
    )]
    pub complain_data: Account<'info, ComplainData>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(index:u32)]
pub struct RecoverTexture<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut,seeds = [
        VBW_SEEDS_TEXTURE_DATA,
        //&index.to_le_bytes()
    ],bump)]
    pub texture_data: Account<'info, TextureData>,
}