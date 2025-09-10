# Septopus

* Septopus使用Solana作为启动网络，将在其上实现Septopus的基础功能。使用Solana的合约来实现这些功能。

## 合约架构

* 使用单一合约入口，但在功能上，按照`Rule`,`King`,`AIs`,`World`等来组织，即提供Septopus的扩展性。

## 功能模块

### 系统初始化

* 建立World的index账号
* 建立World的通用配置的账号

### King的设置

* King设置一个初始的
* King部分包括以下的内容
    1. King的设置和更新
    2. King的选举，选举池的建立、随机选取的确认过程
    3. King的弹劾
    4. King的认证及过期认证的处理

### World部分

* 合约的世界管理部分，包括以下几个部分。
    1. 世界的发行，如何确认世界的所有者
    2. 世界的配置更新

### Block部分

* Block的初始化
* Block的数据更新
* Block的销售
* Block的购买

### Complain部分

* 举报和禁止Block的功能
* 举报和禁止Resource的功能
* 举报和禁止Account的功能