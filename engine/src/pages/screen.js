import { useEffect } from "react";
import Touch from "../septopus/lib/touch";

export default function TestTouch() {
  const dom_id="touch_test";
  const self={
    getDom:(data)=>{
        const parser = new DOMParser();
        return  parser.parseFromString(data, 'text/html');
    },
    info:(txt)=>{
      const el = document.getElementById(dom_id);
      const dom=self.getDom(`<div>${txt}<br /></div>`);
      el.appendChild(dom.body);
    },
  }

  useEffect(() => {
    //const start=async()=>{
      Touch.on(dom_id,"swipe",(ev)=>{
        self.info(`Swipe: ${JSON.stringify(ev)}`)
      });

      Touch.on(dom_id,"swipeLeft",(ev)=>{
        self.info(`SwipeLeft: ${JSON.stringify(ev)}`)
      });

      Touch.on(dom_id,"swipeRight",(ev)=>{
        self.info(`SwipeRight: ${JSON.stringify(ev)}`)
      });

      Touch.on(dom_id,"swipeUp",(ev)=>{
        self.info(`SwipeUp: ${JSON.stringify(ev)}`)
      });

      Touch.on(dom_id,"swipeDown",(ev)=>{
        self.info(`SwipeDown: ${JSON.stringify(ev)}`)
      });

      // Touch.on(dom_id,"touchStart",(ev)=>{
      //   self.info(`TouchStart: ${JSON.stringify(ev)}`)
      // });

      // Touch.on(dom_id,"touchMove",(ev)=>{
      //   self.info(`TouchMove: ${JSON.stringify(ev)}`)
      // });

      // Touch.on(dom_id,"touchEnd",(ev)=>{
      //   self.info(`TouchEnd: ${JSON.stringify(ev)}`)
      // });

      Touch.on(dom_id,"doubleTap",(ev)=>{
        self.info(`DoubleTap: ${JSON.stringify(ev)}`)
      });

      Touch.on(dom_id,"gestureStart",(mid)=>{
        self.info(`GestureStart: ${JSON.stringify(mid)}`)
      });

      Touch.on(dom_id,"gestureMove",(mid,scale)=>{
        self.info(`GestureMove: ${JSON.stringify(mid)}, scale: ${scale}`)
      });

      Touch.on(dom_id,"gestureEnd",(ev)=>{
        self.info(`GestureEnd: ${JSON.stringify(ev)}`)
      });
    //}
    
    //start();
  });

  return (
    <div id={dom_id} style={{width:"100%",height:"600px",background:"#efeecd",overflow:"auto"}}></div>
  );
}
