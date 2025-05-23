import * as anchor from "@coral-xyz/anchor";
import { Septopus } from "../target/types/septopus";
import self from "./preset";

const program = anchor.workspace.Septopus as anchor.Program<Septopus>;
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
self.setENV(provider,program.programId);

const reqs={
  add:async (ipfs,index)=>{
    const users=await self.init({balance:false});
    self.output.start(`Add new texture.`);
    await self.info.texturecounter();
    const sign_init= await program.methods
      .addTexture(ipfs,index)
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
      self.output.end(`Signature of "addTexture": ${sign_init}`);
  },
  approve:async (index)=>{
    const users=await self.init({balance:false});
    self.output.start(`Approve new texture.`);
    //await self.info.modulecounter();
    const sign_init= await program.methods
      .approveTexture(index)
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
      self.output.end(`Signature of "approveTexture": ${sign_init}`);
  },
  recover:async (index)=>{
    const users=await self.init({balance:false});
    self.output.start(`Recover the texture.`);

    const sign_init= await program.methods
      .recoverTexture(index)
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
      self.output.end(`Signature of "recoverTexture": ${sign_init}`);
  },
  complain:async (index,ctxt)=>{
    const users=await self.init({balance:false});
    self.output.start(`Complain the texture.`);

    const sign_init= await program.methods
      .complainTexture(ctxt,index)
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
      self.output.end(`Signature of "complainTexture": ${sign_init}`);
  },
}

describe("Septopus world texture functions test.",() => {
  // it("Add a new texture ( IPFS ).", async () => {
  //   const ipfs="bafkreicl7rl7d6bkgyzxc67jdfoythbthikk7bnt4m22zjd6e7jx5hoerb";
  //   const index=1;
  //   await reqs.add(ipfs,index);
  // });

  // it("Approve new texture ( IPFS ).", async () => {
  //   const index=1;
  //   await reqs.approve(index);
  // });

  // it("Complain texture from banning.", async () => {
  //   const index=1;
  //   const ctxt=JSON.stringify({type:"ban",msg:"Illegle content"});
  //   await reqs.complain(index,ctxt);
  // });

  // it("Recover texture from banning.", async () => {
  //   const index=1;
  //   await reqs.recover(index);
  // });
  
});
