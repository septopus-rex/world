import { useEffect } from 'react';
import './App.css';
import './engine/septopus.bundle.css';
import Septo from './engine/septopus.bundle';

function App() {
  const self = {
    getRenderClass: () => {
      return "w-screen h-screen min-h-80";
    },
  }

  const dom_id="three_demo";
  useEffect(() => {
    const cfg={
      contract:{
        mint:async (x,y,world)=>{
          const hash="2nD7acNeEbShKndVDcUU1yvwDGFvgaYGgGFhGMUpHnAP11tHQ2xsafcYdpvFZv19kFSWxih2WTkjo3L1L4Jyrsc3";
          return {signature:hash,action:"mint"};
        },
        update: async (json,x,y,world)=>{
          const hash="2XaBFF5DN5mXzStj8n1zLD45KoKKTM21BewFieD4FVp5ZsgaeB76yGFkKJ34omGarnTcoQY1HLSVD3bdPKmgR6vh";
          return {signature:hash,action:"update"};
        },
        sell:async(price,x,y,world)=>{
          const hash="4XtC1VGinbs9bHfnpfnsfrcTRR739AbVRBC86m3h5NUevUE7xsm6Fm6kZJF6J3gABE2K65UMAtbpAYcE6X1NTA77";
          return {signature:hash,action:"sell"};
        },
        buy:async(x,y,world)=>{
          const hash="4Ma4scvspiZ5RNHH3ejvJAJZRFF9Rz8Pe26ULieaNddYccVWqWJE2ASn8EZ24YStbPh1L8WtnoZB1JoBaLkFhkjv";
          return {signature:hash,action:"buy"};
        },
        withdraw:async(x,y,world)=>{
          const hash="5TU4xA5GU6HuHMVkVPivc83B88sKTFE7VeUjWmwWdzmYxb6BNBC4dicD9BY5fSdFU66UuaT77zPYpoo1f4DUZ6wZ";
          return {signature:hash,action:"withdraw"};
        },
      },
      fullscreen:true,
      shadow:true,
    };
    
    Septo.launch(dom_id,cfg,(done)=>{
      console.log(`App loaded:`, done);
    });
  }, []);
  return (
    <>
      <div id={dom_id} className={self.getRenderClass()} style={{width:"100%"}}>

      </div>
      <div id="tailwind-check" className="w-[1px] h-[1px] fixed top-0 left-0 bg-fuchsia-500"></div>
    </>
  )
}

export default App
