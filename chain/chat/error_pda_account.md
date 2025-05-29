In this method 

```
	#[derive(Accounts)]
	#[instruction(index:u32)]
	pub struct ReplaceModule<'info> {
	    #[account(mut)]
	    pub payer: Signer<'info>,

	    #[account(
	        init_if_needed,
	        space = SOLANA_PDA_LEN + ModuleData::INIT_SPACE,     
	        payer = payer,
	        seeds = [
	            SPW_SEEDS_MODULE_DATA,
	            &index.to_le_bytes(),
	        ],
	        bump,
	    )]
	    pub module_data: Account<'info, ModuleData>,

	    pub system_program: Program<'info, System>,
	}

	pub fn module_add(
	    ctx: Context<ReplaceModule>,    //default from system
	    index:u32,                  	//module index
	    ipfs:String,                	//IPFS cid          
	) -> Result<()> {

	    Ok(())
	}

```

I got the PDA account at frontend, result is `AkujaPU8ghKP6TgHPDFVtVJMVa5rge4GbCD4eaeWrLeB`
```
	const seeds_data=[
      Buffer.from("m_yz"),
      new BN(index).toArrayLike(Buffer,"le",4)
    ];
    const pda_data=self.getPDA(seeds_data,program.programId,true);
```

But got the error, it seams that the Rust code got a different account

```Bash
	AnchorError: AnchorError caused by account: module_data. Error Code: ConstraintSeeds. Error Number: 2006. Error Message: A seeds constraint was violated.
	Program log: Left:
	Program log: AkujaPU8ghKP6TgHPDFVtVJMVa5rge4GbCD4eaeWrLeB
	Program log: Right:
	Program log: FJDwuFjqpSTqd2pJAgCDeDQRdK5SPqXZPdwpqUyHFZre
	    at Function.parse (/Users/fuzhongqiang/Desktop/www/septopus/world/chain/node_modules/@coral-xyz/anchor/src/error.ts:168:14)
	    at translateError (/Users/fuzhongqiang/Desktop/www/septopus/world/chain/node_modules/@coral-xyz/anchor/src/error.ts:277:35)
	    at MethodsBuilder.rpc [as _rpcFn] (/Users/fuzhongqiang/Desktop/www/septopus/world/chain/node_modules/@coral-xyz/anchor/src/program/namespace/rpc.ts:35:29)
	    at processTicksAndRejections (node:internal/process/task_queues:105:5) {
	  errorLogs: [
	    'Program log: AnchorError caused by account: module_data. Error Code: ConstraintSeeds. Error Number: 2006. Error Message: A seeds constraint was violated.',
	    'Program log: Left:',
	    'Program log: AkujaPU8ghKP6TgHPDFVtVJMVa5rge4GbCD4eaeWrLeB',
	    'Program log: Right:',
	    'Program log: FJDwuFjqpSTqd2pJAgCDeDQRdK5SPqXZPdwpqUyHFZre'
	  ],
	  logs: [
	    'Program 7tUr1JZECqmPAHqew3sjrzmygXsxCfzWoqfXaLsn6AZF invoke [1]',
	    'Program log: Instruction: AddModule',
	    'Program log: AnchorError caused by account: module_data. Error Code: ConstraintSeeds. Error Number: 2006. Error Message: A seeds constraint was violated.',
	    'Program log: Left:',
	    'Program log: AkujaPU8ghKP6TgHPDFVtVJMVa5rge4GbCD4eaeWrLeB',
	    'Program log: Right:',
	    'Program log: FJDwuFjqpSTqd2pJAgCDeDQRdK5SPqXZPdwpqUyHFZre',
	    'Program 7tUr1JZECqmPAHqew3sjrzmygXsxCfzWoqfXaLsn6AZF consumed 5962 of 200000 compute units',
	    'Program 7tUr1JZECqmPAHqew3sjrzmygXsxCfzWoqfXaLsn6AZF failed: custom program error: 0x7d6'
	  ],
	  error: {
	    errorCode: { code: 'ConstraintSeeds', number: 2006 },
	    errorMessage: 'A seeds constraint was violated',
	    comparedValues: [
	      [PublicKey [PublicKey(AkujaPU8ghKP6TgHPDFVtVJMVa5rge4GbCD4eaeWrLeB)]],
	      [PublicKey [PublicKey(FJDwuFjqpSTqd2pJAgCDeDQRdK5SPqXZPdwpqUyHFZre)]]
	    ],
	    origin: 'module_data'
	  },
	  _programErrorStack: ProgramErrorStack {
	    stack: [
	      [PublicKey [PublicKey(7tUr1JZECqmPAHqew3sjrzmygXsxCfzWoqfXaLsn6AZF)]]
	    ]
	  }
	}
```