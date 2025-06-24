# Deployment Details

## Domain

* [https://world.septopus.xyz/demo](https://world.septopus.xyz/demo)
* Need to run `nohup yarn start &` on server, as only the source code is copied to server.

* Screen test [https://world.septopus.xyz/screen](https://world.septopus.xyz/screen)

## How to run

```Bash
    # after Jenkins task.
    cd /home/wwwroot/world
    yarn build
    rm -rf ./nohup.out
    nohup yarn start &
```

## How to stop

```Bash
    # find the sid of next for stopping
    # two tasks need to kill.
    ps aux | grep next
```