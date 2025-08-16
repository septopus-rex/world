use {
    anchor_lang::prelude::*,
    serde_json::{json, Value},
};

pub fn adjunct_add(
    ctx: Context<NewWorld>,     //default from system
    name:String,                //adjunct unique name
    code:String,                //adjunct code
) -> Result<()> {

    Ok(())
}

pub fn adjunct_view(
    ctx: Context<NewWorld>,     //default from system
    name:String,                //adjunct unique name
) -> Result<()> {
    
    Ok(())
}