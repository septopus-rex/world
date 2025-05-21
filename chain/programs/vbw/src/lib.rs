#![allow(unexpected_cfgs)]  //solve the #[program] warning issue

use anchor_lang::prelude::*;

declare_id!("7tUr1JZECqmPAHqew3sjrzmygXsxCfzWoqfXaLsn6AZF");

use {
    world::*,
    block::*,
    resource::*,
    manage::*,
};
pub mod world;
pub mod block;
pub mod resource;
pub mod manage;
pub mod constants;

#[program]
pub mod vbw {
    use super::*;

    /************************************************************************************************/
    /********************************* System setting functions *************************************/
    /************************************************************************************************/

    ///init whole VBW system
    pub fn init(
        ctx: Context<InitVBW>,
        root:String,
        recipient:String,
    ) -> Result<()> {
        world::init(ctx,root,recipient)
    }


    ///insert or update adjunct details
    pub fn adjunct_world(
        ctx: Context<WorldAdjunct>,
        index:u32,
        short:String,
        name:String,
        format:String,
    ) -> Result<()> {
        world::adjunct(ctx,index,short,name,format)
    }

    ///start a new world when it is ready
    pub fn start_world(
        ctx: Context<NewWorld>,
        index:u32,
        setting:String,
    ) -> Result<()> {
        world::start(ctx,index,setting)
    }

    /************************************************************************************************/
    /********************************* Block related functions **************************************/
    /************************************************************************************************/

    ///Mint out a new block if it is valid.
    pub fn mint_block(
        ctx: Context<MintBlock>,
        x: u32,
        y:u32,
        world:u32
    ) -> Result<()> {
        block::mint(ctx,x,y,world)
    }

    ///Update the data account address
    pub fn update_block(
        ctx: Context<UpdateBlock>,
        data:String,          //JSON format data
        x: u32,
        y: u32,
        world: u32
    ) -> Result<()> {
        block::update(ctx,x,y,world,data)
    }

    ///set price to sell block
    pub fn sell_block(
        ctx: Context<SellBlock>,
        x: u32,
        y: u32,
        world: u32,
        price: u64,
    ) -> Result<()> {
        block::sell(ctx,x,y,world,price)
    }

    ///buy the on-sell block
    pub fn buy_block(
        ctx: Context<BuyBlock>,
        x: u32,
        y: u32,
        world: u32,
    ) -> Result<()> {
        block::buy(ctx,x,y,world)
    }

    ///buy the on-sell block
    pub fn revoke_block(
        ctx: Context<RevokeBlock>,
        x: u32,
        y: u32,
        world: u32,
    ) -> Result<()> {
        block::revoke(ctx,x,y,world)
    }

    ///complain when block content is illeagale
    pub fn complain_block(
        ctx: Context<ComplainBlock>,
        json:String,                        //JSON format complain struct, need to check 
        x: u32,
        y: u32,
        world: u32,
    ) -> Result<()> {
        block::complain(ctx,x,y,world,json)
    }

    ///recover the banned block, manage operation
    pub fn recover_block(
        ctx: Context<RecoverBlock>,
        x: u32,
        y: u32,
        world: u32,
    ) -> Result<()> {
        block::recover(ctx,x,y,world)
    }

    ///ban the target block, manage operation
    pub fn ban_block(
        ctx: Context<BanBlock>,
        x: u32,
        y: u32,
        world: u32,
    ) -> Result<()> {
        manage::block(ctx,x,y,world)
    }

    /************************************************************************************************/
    /************************************* Texture Management ***************************************/
    /************************************************************************************************/

    ///add new IPFS texture, need to approve
    // pub fn add_texture(
    //     ctx: Context<AddTexture>,
    //     ipfs: String,
    //     index: u32,
    // ) -> Result<()> {
    //     texture::texture_add(ctx,index,ipfs)
    // }

    pub fn new_texture(
        ctx: Context<NewTexture>,
        ipfs: String,
        index: u32,
    )-> Result<()> {
        texture::texture_new(ctx,index,ipfs)
    }


    ///complain when texture content is illeagale
    pub fn complain_texture(
        ctx: Context<ComplainTexture>,
        data: String,
        index: u32,
    ) -> Result<()> {
        texture::texture_complain(ctx,index,data)
    }

    ///approve to allow texture for VBW, manage operation
    pub fn approve_texture(
        ctx: Context<ApproveTexture>,
        index: u32,
    ) -> Result<()> {
        texture::texture_approve(ctx,index)
    }  

    ///recover the banned texture, manage operation
    pub fn recover_texture(
        ctx: Context<RecoverTexture>,
        index: u32,
    ) -> Result<()> {
        texture::texture_recover(ctx,index)
    }

    ///ban the target texture, manage operation
    pub fn ban_texture(
        ctx: Context<BanTexture>,
        index: u32,
    ) -> Result<()> {
        manage::texture(ctx,index)
    }

    /************************************************************************************************/
    /************************************* Module Management ****************************************/
    /************************************************************************************************/

    ///add new IPFS module, need to approve
    pub fn add_module(
        ctx: Context<AddModule>,
        ipfs: String,
        index: u32,
    ) -> Result<()> {
        module::module_add(ctx,index,ipfs)
    }

    ///complain when texture content is illeagale
    pub fn complain_module(
        ctx: Context<ComplainModule>,
        data:String,
        index: u32,
    ) -> Result<()> {
        module::module_complain(ctx,index,data)
    }

    ///approve to allow module for VBW, manage operation
    pub fn approve_module(
        ctx: Context<ApproveModule>,
        index: u32,
    ) -> Result<()> {
        module::module_approve(ctx,index)
    }

    ///recover the banned module, manage operation
    pub fn recover_module(
        ctx: Context<RecoverModule>,
        index: u32,
    ) -> Result<()> {
        module::module_recover(ctx,index)
    }

    ///ban the target module, manage operation
    pub fn ban_module(
        ctx: Context<BanModule>,
        index: u32,
    ) -> Result<()> {
        manage::module(ctx,index)
    }
}