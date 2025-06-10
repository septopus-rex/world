import * as anchor from "@coral-xyz/anchor";
import { Septopus } from "../target/types/septopus";
import { PublicKey,SystemProgram,SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import self from "./preset";
import { BN } from "bn.js";

const program = anchor.workspace.Septopus as anchor.Program<Septopus>;
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
self.setENV(provider,program.programId);

const reqs={
  add:async (ipfs,index)=>{
    const users=await self.init({balance:true});
    self.output.start(`Add new resource.`);

    const n_index=Buffer.alloc(4);
    n_index.writeUInt32LE(index);
    //const n_index=Buffer.alloc(4);
    //n_index.writeUInt32LE(index);
    const seeds_data=[
      Buffer.from("m_yz"),
      n_index,
      //new BN(index).toArrayLike(Buffer,"le",4)
    ];
    const pda_data=self.getPDA(seeds_data,program.programId,true);

    console.log(pda_data);
    
    //await self.info.modulecounter();
    //!important, here is a bug, the PDA account calculated at frontend is not the same as contract
    //!important, need to check on Devnet
    const resourceData = new PublicKey("CCLbGcdTft84d8fGRPY1fqoCXEhUsRHpATNYuNFjNHKX");
    const sign_init= await program.methods
      .addResource(ipfs,index)
      .accounts({
        payer:users.recipient.pair.publicKey,
        resourceData:resourceData,
        systemProgram: SystemProgram.programId
      })
      .signers([users.recipient.pair])
      .rpc()
      .catch((e)=>{
        self.output.hr("Got Error");
        console.error("Transaction failed");
        if (e.logs) {
          console.log("Program logs:");
          for (const line of e.logs) console.log(line);
        } else if (e instanceof anchor.AnchorError) {
          console.log(e.logs);
        } else {
          console.log(e);
        }
      });
      //await self.info.moduledata(index);
      self.output.end(`Signature of "addResource": ${sign_init}`);
  },
  approve:async(index)=>{
    const users=await self.init({balance:true});
    self.output.start(`Approve new module.`);
    //await self.info.modulecounter();
    const sign_init= await program.methods
      .approveResource(index)
      .accounts({
        payer:users.manager.pair.publicKey,
      })
      .signers([users.manager.pair])
      .rpc()
      .catch((err)=>{
        self.output.hr("Got Error");
        console.log(err);
      });
      //await self.info.moduledata(index);
      self.output.end(`Signature of "approveModule": ${sign_init}`);
  },
  complain:async (index,ctxt)=>{
    const users=await self.init({balance:false});
    self.output.start(`Complain the module.`);

    const sign_init= await program.methods
      .complainResource(ctxt,index)
      .accounts({
        payer:users.manager.pair.publicKey,
      })
      .signers([users.manager.pair])
      .rpc()
      .catch((err)=>{
        self.output.hr("Got Error");
        console.log(err);
      });
      //await self.info.moduledata(index);
      self.output.end(`Signature of "complainModule": ${sign_init}`);
  },
  recover:async(index)=>{
    const users=await self.init({balance:false});
    self.output.start(`Recover the module from banning.`);

    const sign_init= await program.methods
      .recoverResource(index)
      .accounts({
        payer:users.manager.pair.publicKey,
      })
      .signers([users.manager.pair])
      .rpc()
      .catch((err)=>{
        self.output.hr("Got Error");
        console.log(err);
      });
      //await self.info.moduledata(index);
      self.output.end(`Signature of "recoverModule": ${sign_init}`);
  },
}

describe("VBW module functions test.",() => {

  // it("Add a new resource ( IPFS ).", async () => {
  //   const ipfs="bafkreicl7rl7d6bkgyzxc67jdfoythbthikk7bnt4m22zjd6e7jx5hoerb";
  //   const index=3;
  //   await reqs.add(ipfs,index);
  // });

  // it("Approve new module ( IPFS ).", async () => {
  //   const index=1;
  //   await reqs.approve(index);
  // });

  // it("Complain module to ban.", async () => {
  //   const index=1;
  //   const ctxt=JSON.stringify({type:"ban",msg:"Illegle content"});
  //   await reqs.complain(index,ctxt);
  // });

  // it("Recover module from banning.", async () => {
  //   const index=1;
  //   await reqs.recover(index);
  // });
});
