import { useEffect } from "react";
import World from "@/septopus/app";

export default function Demo() {
  const self = {
    getRenderClass: () => {
      return "w-screen h-screen min-h-80";
    },
  }

  useEffect(() => {
    const cfg={
      
    };
    World.launch("three_demo",cfg,(done)=>{
      console.log(`App loaded:`, done);
    });
  }, []);

  return (
    <div id="three_demo" className={self.getRenderClass()} style={{height:"600px"}}></div>
  );
}
