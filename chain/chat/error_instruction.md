It is alright when the code as follow.
```Rust
#[derive(Accounts)]
pub struct ReplaceModule<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
}


pub fn module_add(
    ctx: Context<ReplaceModule>,
    index:u32,
    ipfs:String, 
) -> Result<()> {

    Ok(())
}
```

I need `index` to get PDA account, then the code.

```Rust
#[derive(Accounts)]
#[instruction(index:u32,ipfs:String)]
pub struct ReplaceModule<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
}


pub fn module_add(
    ctx: Context<ReplaceModule>,
    index:u32,
    ipfs:String, 
) -> Result<()> {

    Ok(())
}
```

Bad luck, I got the error.

```Bash
    SendTransactionError: Simulation failed.
    Message: Transaction simulation failed: Error processing Instruction 0: Program failed to complete.
    Logs:
    [
      "Program 7tUr1JZECqmPAHqew3sjrzmygXsxCfzWoqfXaLsn6AZF invoke [1]",
      "Program log: Instruction: AddModule",
      "Program log: Error: memory allocation failed, out of memory",
      "Program 7tUr1JZECqmPAHqew3sjrzmygXsxCfzWoqfXaLsn6AZF consumed 1161 of 200000 compute units",
      "Program 7tUr1JZECqmPAHqew3sjrzmygXsxCfzWoqfXaLsn6AZF failed: SBF program panicked"
    ].
    Catch the `SendTransactionError` and call `getLogs()` on it for full details.
        at Connection.sendEncodedTransaction (/Users/fuzhongqiang/Desktop/www/septopus/world/chain/node_modules/@solana/web3.js/src/connection.ts:6047:13)
        at processTicksAndRejections (node:internal/process/task_queues:105:5)
        at Connection.sendRawTransaction (/Users/fuzhongqiang/Desktop/www/septopus/world/chain/node_modules/@solana/web3.js/src/connection.ts:6003:20)
        at sendAndConfirmRawTransaction (/Users/fuzhongqiang/Desktop/www/septopus/world/chain/node_modules/@coral-xyz/anchor/src/provider.ts:377:21)
        at AnchorProvider.sendAndConfirm (/Users/fuzhongqiang/Desktop/www/septopus/world/chain/node_modules/@coral-xyz/anchor/src/provider.ts:163:14)
        at MethodsBuilder.rpc [as _rpcFn] (/Users/fuzhongqiang/Desktop/www/septopus/world/chain/node_modules/@coral-xyz/anchor/src/program/namespace/rpc.ts:29:16) {
      signature: '',
      transactionMessage: 'Transaction simulation failed: Error processing Instruction 0: Program failed to complete',
      transactionLogs: [
        'Program 7tUr1JZECqmPAHqew3sjrzmygXsxCfzWoqfXaLsn6AZF invoke [1]',
        'Program log: Instruction: AddModule',
        'Program log: Error: memory allocation failed, out of memory',
        'Program 7tUr1JZECqmPAHqew3sjrzmygXsxCfzWoqfXaLsn6AZF consumed 1161 of 200000 compute units',
        'Program 7tUr1JZECqmPAHqew3sjrzmygXsxCfzWoqfXaLsn6AZF failed: SBF program panicked'
      ],
      programErrorStack: ProgramErrorStack {
        stack: [
          [PublicKey [PublicKey(7tUr1JZECqmPAHqew3sjrzmygXsxCfzWoqfXaLsn6AZF)]]
        ]
      }
    }
```