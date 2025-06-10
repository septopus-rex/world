import * as anchor from "@coral-xyz/anchor";
import { Septopus } from "../target/types/septopus";
import self from "./preset";

const program = anchor.workspace.Septopus as anchor.Program<Septopus>;
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
self.setENV(provider,program.programId);

const reqs={
  texture:{
    
  }
}

describe("VBW complain functions test.",() => {

  // it("Ban texture.", async () => {
    
  // });
});
