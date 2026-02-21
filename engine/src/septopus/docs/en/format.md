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

## Trigger

* Need a Trigger Language to storage on chain, can be decode by engine.

* How to. Event trigger point to a function which will be push in the frame synchronous queue. Then the engine just need to listen the condition how to trigger.

* Confliction: more than one event try to modify the same parameters, the actions will be deal with carefully. 
