# Format Detail

## Task

* Sample task

```Javascript
    //normal task
    {
        adjunct:"wall",
        action:"set",               //["set","add","remove"]
        x:2025,
        y:302,
        param:{
            x:2,                    // STD_KEY --> Value
        },
        limit:["X","Y","Z"],        //limit the size, adjunct can check the range
    }

    //block task
    {
        block:[2024,501],
        action:"set",               //["load","unload","set"]
        param:{
            elevation:2,
        },
    }
```
