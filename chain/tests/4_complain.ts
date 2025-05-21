import * as anchor from "@coral-xyz/anchor";
import { Vbw } from "../target/types/vbw";
import self from "./preset";

const program = anchor.workspace.Vbw as anchor.Program<Vbw>;
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
self.setENV(provider,program.programId);

const reqs={
  texture:{
    
  }
}

describe("VBW complain functions test.",() => {

  it("Ban texture.", async () => {
    
  });
});
