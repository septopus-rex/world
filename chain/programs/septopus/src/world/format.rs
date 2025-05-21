use serde_json::{Value};

/********************************************************************/
/************************ Public Functions **************************/
/********************************************************************/

///!important, check every detail of world setting data
///TODO, here to check world setting  carefully.

pub fn is_valid_world_setting(input: &str) -> bool {
    let _parsed: Value = match serde_json::from_str(input) {
        Ok(json) => json,
        Err(_) => return false,
    };


    true
}


/********************************************************************/
/*********************** Private Functions **************************/
/********************************************************************/


/********************************************************************/
/**************************** Test Part *****************************/
/********************************************************************/

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_world_data(){
        let json_str = r#"
            {
                "name":"NAME_OF_WORLD",
                "desc":"Description of new world",
                "accuracy":1000,
                "size":[4096,4096],
                "side":[16,16],
                "block":{
                    "size":[16,16,20],              
                    "diff":3,
                    "status":["raw","public", "private","banned", "locked"]      
                },
                "time":{
                    "slot":1000,
                    "year":360,
                    "month":12,
                    "hour":24
                },
                "sky":{
                    "sun":1,
                    "moon":3
                },
                "weather":{
                    "category":["cloud","rain","snow"],       
                    "grading":8
                }
            }
            "#;
        assert_eq!(
            true,
            is_valid_world_setting(json_str)
        );
    }
}