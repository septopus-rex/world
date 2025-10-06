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
pub mod septopus {
    use super::*;

    /************************************************************************************************/
    /********************************* System setting functions *************************************/
    /************************************************************************************************/

    ///init whole septopus world system
    pub fn init(
        ctx: Context<InitSPW>,
        root:String,
        recipient:String,
    ) -> Result<()> {
        world::init(ctx,root,recipient)
    }


    ///insert or update adjunct details
    pub fn adjunct_world(
        ctx: Context<WorldAdjunct>,
        index:u32,
        short:u32,
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
    pub fn withdraw_block(
        ctx: Context<WithdrawBlock>,
        x: u32,
        y: u32,
        world: u32,
    ) -> Result<()> {
        block::withdraw(ctx,x,y,world)
    }

    ///complain when block content is illeagale
    pub fn complain_block(
        ctx: Context<ComplainBlock>,
        json:String,                        //JSON format complain struct, need to check 
        x: u32,
        y: u32,
        world: u32,
    ) -> Result<()> {
        complain::block(ctx,x,y,world,json)
    }

    ///recover the banned block, manage operation
    pub fn recover_block(
        ctx: Context<RecoverBlock>,
        x: u32,
        y: u32,
        world: u32,
    ) -> Result<()> {
        recover::block(ctx,x,y,world)
    }

    ///ban the target block, manage operation
    pub fn ban_block(
        ctx: Context<BanBlock>,
        x: u32,
        y: u32,
        world: u32,
    ) -> Result<()> {
        ban::block(ctx,x,y,world)
    }

    /************************************************************************************************/
    /************************************* Resource Management ****************************************/
    /************************************************************************************************/

    ///add new IPFS resource, need to approve
    pub fn add_resource(
        ctx: Context<AddResource>,
        ipfs: String,
        index: u32,
    ) -> Result<()> {
        ipfs::resource_add(ctx,index,ipfs)
    }

    ///approve to allow resource (module, texture ...) for Septopus World, manage operation
    pub fn approve_resource(
        ctx: Context<ApproveResource>,
        index: u32,
    ) -> Result<()> {
        approve::resource(ctx,index)
    }

    ///complain when resource content is illeagale
    pub fn complain_resource(
        ctx: Context<ComplainResource>,
        data:String,
        index: u32,
    ) -> Result<()> {
        complain::resource(ctx,index,data)
    }

    ///recover the banned resource, manage operation
    pub fn recover_resource(
        ctx: Context<RecoverResource>,
        index: u32,
    ) -> Result<()> {
        recover::resource(ctx,index)
    }

    ///ban the target resource, manage operation
    pub fn ban_resource(
        ctx: Context<BanResource>,
        index: u32,
    ) -> Result<()> {
        ban::resource(ctx,index)
    }
}