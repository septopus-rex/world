import { Keypair,PublicKey,SystemProgram,LAMPORTS_PER_SOL,Transaction } from "@solana/web3.js";
import { getAccount,getAssociatedTokenAddressSync } from '@solana/spl-token';

let provider = null;
let PID = null;
const seed_root = "great april trend rely recipe agent sting owner forget sibling luggage root";
const seed_recipient="yesterday april buy rely recipe agent sting friend forget sibling luggage root";
const seed_manager = "great bad trend rely apple agent sting owner forget sibling luggage root";
const seed_creator= "today april trend rely wait agent sting owner forget sibling luggage root";

const self={
    setENV:(pvd,programId)=>{
        provider=pvd;
        PID=programId;
    },
    init:async (cfg)=>{
      self.output.hr("Preparing accounts");

      const pair_root=self.getKeypairFromSeed(seed_root);
      const pair_manager=self.getKeypairFromSeed(seed_manager);
      const pair_creator=self.getKeypairFromSeed(seed_creator);
      const pair_recipient=self.getKeypairFromSeed(seed_recipient);
      const pair_user_0=self.getKeypair();
      const pair_user_1=self.getKeypair();

      //1.准备账号
      const users={
        root:{
          seed:seed_root,
          pair:pair_root,
        },
        manager:{
          seed:seed_manager,
          pair:pair_manager,
        },
        recipient:{
          seed:seed_recipient,
          pair:pair_recipient,
        },
        creator:{
          seed:seed_creator,
          pair:pair_creator,
        },
        signer:[
          pair_user_0,
          pair_user_1,
        ],
      }

      //2.模拟水龙头加SOL
      const amount=8
      await self.fundAccount(users.root.pair.publicKey,amount,provider.wallet);
      await self.fundAccount(users.manager.pair.publicKey,amount,provider.wallet);
      await self.fundAccount(users.recipient.pair.publicKey,amount,provider.wallet);
      await self.fundAccount(users.creator.pair.publicKey,amount,provider.wallet);
      await self.fundAccount(users.signer[0].publicKey,amount,provider.wallet);
      await self.fundAccount(users.signer[1].publicKey,amount,provider.wallet);

      if(cfg && cfg.balance) await self.showBalance(users);
      self.output.hr("Account done.");
      return users;
    },
    showBalance:async (users)=>{
      const bs_root= await self.getBalance(users.root.pair.publicKey);
      const bs_manager=await self.getBalance(users.manager.pair.publicKey);
      const bs_creator=await self.getBalance(users.creator.pair.publicKey);
      const bs_recipient=await self.getBalance(users.recipient.pair.publicKey);
      const bs_user_0=await self.getBalance(users.signer[0].publicKey);
      const bs_user_1=await self.getBalance(users.signer[1].publicKey);
      
      console.log(`Root (${users.root.pair.publicKey.toString()}) balance: ${bs_root} SOL.`);
      console.log(`Manager (${users.manager.pair.publicKey.toString()}) balance: ${bs_manager} SOL.`);
      console.log(`Recipient (${users.recipient.pair.publicKey.toString()}) balance: ${bs_recipient} SOL.`);
      console.log(`Creator (${users.creator.pair.publicKey.toString()}) balance: ${bs_creator} SOL.`);
      console.log(`User_0 (${users.signer[0].publicKey.toString()}) balance: ${bs_user_0} SOL.`);
      console.log(`User_1 (${users.signer[1].publicKey.toString()}) balance: ${bs_user_1} SOL.`);
    },
    
    getTokenAccount:(pubkey,mintPDA)=>{;
      return getAssociatedTokenAddressSync(mintPDA, pubkey);
    },
    
    getTokenBalance:async(tokenAddress)=>{
      //console.log(`here`,getAccount,tokenAddress);
      const tk_new = await getAccount(provider.connection, tokenAddress);
      //console.log(tk_new);
      return Number(tk_new.amount);
    },
    getBalance:async (pub:PublicKey)=>{
      const balance = await provider.connection.getBalance(pub);
      return balance;
    },
    getKeypairFromSeed:(str)=>{
        const seed = new TextEncoder().encode(str).slice(0, 32);
        return Keypair.fromSeed(seed);
      },
    getPDA:(seeds:Buffer[],programId, isBump=false)=>{
      //const arr=[Buffer.from('lememe_mapping')];
      const [PDA_account,_bump] = PublicKey.findProgramAddressSync(seeds,programId);
      console.log(seeds,_bump);
      if(!!isBump) return [_bump,PDA_account];
      return PDA_account;
    },
    
    getAccount:async (account)=>{
      const acc= await provider.connection.getAccountInfo(account);
      return acc;
    },
    getKeypair:()=>{
      return new Keypair();
    },
    fundAccount:async (to_pubkey, amount:number, from:any)=>{
      if(from===undefined) from=provider.wallet;
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: from.publicKey,
          toPubkey: to_pubkey,
          lamports: amount*LAMPORTS_PER_SOL,
        })
      );
      const txSignature = await provider.sendAndConfirm(transaction);
      return txSignature;
    },
    output:{
      hr:(title)=>{
        console.log(`--------------------------- ${title}---------------------------`);
      },
      start:(title)=>{
        console.log(`\n---------------------------${title}---------------------------`);
      },
      end:(title)=>{
        console.log(`****** END:${title} ******`);
      },
    },
    info:{
        worldlist:async ()=>{
          const pda_worldlist=self.getPDA([Buffer.from("worlds")],PID);
          const raw=await self.getAccount(pda_worldlist);
          //console.log(data_w);
          if(raw===null) return console.log(`"worldlist" is not created.`)
            console.log(raw.data.toString());
        },
        worldcounter:async (index)=>{
          const n_index=Buffer.alloc(4);
          n_index.writeUInt32LE(index);
          
          const pda_counter=self.getPDA([
            Buffer.from("w_ct"),
            n_index,
          ],PID);
          const raw=await self.getAccount(pda_counter);
          if(raw===null) return console.log(`"worldcounter" is not created.`)
          console.log(raw.data.toString());
        },
        whitelist:async ()=>{
          const pda_white=self.getPDA([Buffer.from("white")],PID);
          const raw=await self.getAccount(pda_white);
          if(raw===null) return console.log(`"whitelist" is not created.`)
          console.log(raw.data.toString());
        },

        modulecounter:async ()=>{
          const pda_mcounter=self.getPDA([Buffer.from("c_md")],PID);
          const raw=await self.getAccount(pda_mcounter);
          if(raw===null) return console.log(`"modulecounter" is not created.`)
          console.log(raw.data.toString());
        },
        texturecounter:async ()=>{
          const pda_tcounter=self.getPDA([Buffer.from("c_tx")],PID);
          const raw=await self.getAccount(pda_tcounter);
          if(raw===null) return console.log(`"texturecounter" is not created.`)
          console.log(raw.data.toString());
        },
        blockdata:async (x,y,world)=>{
          const x_u32=Buffer.alloc(4);
          x_u32.writeUInt32LE(x);
          const y_u32=Buffer.alloc(4);
          y_u32.writeUInt32LE(y);
          const world_u32=Buffer.alloc(4);
          world_u32.writeUInt32LE(world);
          
          const pda_account=self.getPDA([
            Buffer.from("b_dt"),
            x_u32,
            y_u32,
            world_u32
          ],PID);
          const raw=await self.getAccount(pda_account);
          if(raw===null) return console.log(`"texturecounter" is not created.`)
          console.log(raw.data.toString());
        },
        moduledata:async (index)=>{
          const n_index=Buffer.alloc(4);
          n_index.writeUInt32LE(index);
          
          const pda_counter=self.getPDA([
            Buffer.from("m_yz"),
            n_index,
          ],PID);
          const raw=await self.getAccount(pda_counter);
          if(raw===null) return console.log(`"moduledata" is not created.`)
          console.log(raw.data.toString());
        },
    },
  }
  
export default self;