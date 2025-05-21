import * as anchor from "@coral-xyz/anchor";
import { Septopus } from "../target/types/septopus";
import self from "./preset";

const program = anchor.workspace.Septopus as anchor.Program<Septopus>;
const provider = anchor.AnchorProvider.env();

anchor.setProvider(provider);
self.setENV(provider,program.programId);

const reqs={
  init:async()=>{
    const users=await self.init({balance:true});
    self.output.start(`System initialization`);
    const pkey=users.manager.pair.publicKey.toString()
    const recipient=users.recipient.pair.publicKey.toString();
    const sign_init= await program.methods
      .init(pkey,recipient)
      .accounts({
        payer:users.root.pair.publicKey,
      })
      .signers([users.root.pair])
      .rpc()
      .catch((err)=>{
        self.output.hr("Got Error");
        console.log(err);
      });
    await self.info.whitelist();
    await self.info.modulecounter();
    await self.info.texturecounter();
    self.output.end(`Signature of "init": ${sign_init}`);
  },
  create:async(index,json)=>{
    const users=await self.init({balance:true});
    self.output.start(`Create new world`);
    
    const sign_init= await program.methods
      .startWorld(index,json)
      .accounts({
        payer:users.root.pair.publicKey,
      })
      .signers([users.root.pair])
      .rpc()
      .catch((err)=>{
        self.output.hr("Got Error");
        console.log(err);
      });
    await self.info.worldlist();
    await self.info.worldcounter(index);
    self.output.end(`Signature of "startWorld": ${sign_init}`);
  },
  adjunct:async(world,short,name,format)=>{
    const users=await self.init({balance:true});
    self.output.start(`Add new adjunct.`);

    const sign_init= await program.methods
      .adjunctWorld(world,short,name,format)
      .accounts({
        payer:users.root.pair.publicKey,
      })
      .signers([users.root.pair])
      .rpc()
      .catch((err)=>{
        self.output.hr("Got Error");
        console.log(err);
      });
      await self.info.worldlist();
      self.output.end(`Signature of "startWorld": ${sign_init}`);
  },
}

describe("VBW world functions test.",() => {
  it("Init system successful test.", async () => {
    await reqs.init();
  });

  it("Create a new world.", async () => {
    const cfg={
      "name":"NAME_OF_WORLD",
      "desc":"Description of new world",
      "accuracy":1000,
      "size":[4096,4096],
      "side":[16,16],
      "block":{
          "size":[16,16,20],              
          "diff":3,
          "status":["raw","public", "private","banned", "locked"]      
      },
      "time":{
          "slot":1000,
          "year":360,
          "month":12,
          "hour":24
      },
      "sky":{
          "sun":1,
          "moon":3
      },
      "weather":{
          "category":["cloud","rain","snow"],       
          "grading":8
      }
    }
    const index=0;
    const json=JSON.stringify(cfg);
    await reqs.create(index,json);
    //await reqs.create(index+1,json);
  });

  // it("Add a new adjunct.", async () => {
  //   const index=0;
  //   const short="a9";
  //   const name="cat";
  //   const format=JSON.stringify([[1,2,2],[3,4,5],0,2]);
  //   await reqs.adjunct(index,short,name,format);
  // })
});
