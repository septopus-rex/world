import * as anchor from "@coral-xyz/anchor";
import { Septopus } from "../target/types/septopus";
import self from "./preset";

const program = anchor.workspace.Septopus as anchor.Program<Septopus>;
const provider = anchor.AnchorProvider.env();

anchor.setProvider(provider);
self.setENV(provider,program.programId);

//let users=null;
const reqs={
  init:async ()=>{
    
  },
  mint:async (x,y,world)=>{
    const users=await self.init({balance:true});
    self.output.start(`Mint new block`);
    await self.info.whitelist();
    
    const sign_init= await program.methods
      .mintBlock(x,y,world)
      .accounts({
        payer:users.creator.pair.publicKey,
      })
      .signers([users.creator.pair])
      .rpc()
      .catch((err)=>{
        self.output.hr("Got Error");
        console.log(err);
      });

      await self.info.blockdata(x,y,world);
      self.output.end(`Signature of "mintBlock": ${sign_init}`);
  },
  update:async(data,x,y,world)=>{
    const users=await self.init({balance:true});
    self.output.start(`Update block data.`);
    const sign_init= await program.methods
      .updateBlock(data,x,y,world)
      .accounts({
        payer:users.creator.pair.publicKey,
      })
      .signers([users.creator.pair])
      .rpc()
      .catch((err)=>{
        self.output.hr("Got Error");
        console.log(err);
      });

      await self.info.blockdata(x,y,world);
      self.output.end(`Signature of "updateBlock": ${sign_init}`);
  },
  sell:async(price,x,y,world)=>{
    const users=await self.init({balance:true});
    self.output.start(`Sell block.`);
    const sign_init= await program.methods
      .sellBlock(x,y,world,price)
      .accounts({
        payer:users.creator.pair.publicKey,
      })
      .signers([users.creator.pair])
      .rpc()
      .catch((err)=>{
        self.output.hr("Got Error");
        console.log(err);
      });

      await self.info.blockdata(x,y,world);
      self.output.end(`Signature of "sellBlock": ${sign_init}`);
  },
  buy:async(x,y,world)=>{
    const users=await self.init({balance:true});
    self.output.start(`Buy block.`);
    const sign_init= await program.methods
      .buyBlock(x,y,world)
      .accounts({
        payer:users.manager.pair.publicKey,
      })
      .signers([users.manager.pair])
      .rpc()
      .catch((err)=>{
        self.output.hr("Got Error");
        console.log(err);
      });

      await self.info.blockdata(x,y,world);
      self.output.end(`Signature of "buyBlock": ${sign_init}`);
  },
  revoke:async(x,y,world)=>{
    const users=await self.init({balance:true});
    self.output.start(`Revoke block.`);
    const sign_init= await program.methods
      .revokeBlock(x,y,world)
      .accounts({
        payer:users.creator.pair.publicKey,
      })
      .signers([users.creator.pair])
      .rpc()
      .catch((err)=>{
        self.output.hr("Got Error");
        console.log(err);
      });

      await self.info.blockdata(x,y,world);
      self.output.end(`Signature of "revokeBlock": ${sign_init}`);
  },
  recover:async(x,y,world)=>{
    const users=await self.init({balance:true});
    self.output.start(`Recover block.`);
    const sign_init= await program.methods
      .recoverBlock(x,y,world)
      .accounts({
        payer:users.creator.pair.publicKey,
      })
      .signers([users.creator.pair])
      .rpc()
      .catch((err)=>{
        self.output.hr("Got Error");
        console.log(err);
      });

      await self.info.blockdata(x,y,world);
      self.output.end(`Signature of "recoverBlock": ${sign_init}`);
  },
  complain:async(ctxt,x,y,world)=>{
    const users=await self.init({balance:true});
    self.output.start(`Recover block.`);
    const sign_init= await program.methods
      .complainBlock(ctxt,x,y,world)
      .accounts({
        payer:users.creator.pair.publicKey,
      })
      .signers([users.creator.pair])
      .rpc()
      .catch((err)=>{
        self.output.hr("Got Error");
        console.log(err);
      });

      await self.info.blockdata(x,y,world);
      self.output.end(`Signature of "complainBlock": ${sign_init}`);
  },
}


describe("VBW block functions test.",async () => {
  it("Mint block out.", async () => {
    const x=2025,y=503,world=0;
    await reqs.mint(x,y,world);
  });

  // it("Complain block for banning.", async () => {
  //   const x=2025,y=502,world=0;
  //   const ctxt=JSON.stringify({type:"ban",msg:"Illegle content"});
  //   await reqs.complain(ctxt,x,y,world);
  // });

  // it("Update block detail.", async () => {
  //   const x=2025,y=386,world=0;
  //   const data="7cXc1JZECqmPAHqew3sjrzmygXsxCfzWoqfXaLsn6AZF";
  //   await reqs.mint(x,y,world);
  //   await reqs.update(data,x,y,world);
  // });


  // it("Sell block by target price.", async () => {
  //   const x=2025,y=502,world=0;
  //   const price=13000000;
  //   //await reqs.mint(price,x,y);
  //   await reqs.sell(price,x,y,world);
  // });

  // it("Buy block.", async () => {
  //   const x=2025,y=502,world=0;
  //   await reqs.buy(x,y,world);
  // });

  // it("Revoke block from selling.", async () => {
  //   const x=2025,y=502,world=0;
  //   await reqs.revoke(x,y,world);
  // });

  // it("Recover block from banned.", async () => {
  //   const x=2025,y=502,world=0;
  //   await reqs.recover(x,y,world);
  // });
});
