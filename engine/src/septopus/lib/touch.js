/**
 *  Touch and Gesture support
 *
 * @fileoverview
 *  1. screen interaction
 *  2. return needed paramters
 *
 * @author Fuu
 * @date 2025-06-23
 */

const config={
    delay:500,          //double tap delay
    distance:10,        //double tap distance
    key:"entry",        //attibution key 
    swipe:{
        delay:800,
        distance:50,
    }
};

const format={
    size:[0,0],
    position:[0,0],     //dom offset
    stamp:0,
    start:null,
    move:{
        last:null,
    },
    gesture:{
        on:false,
        last:null,          //last mid point
        distance:0,
        scale:1,
    },
};

//dock binding events
const events={
    singleTap:{},
    doubleTap:{},
    touchStart:{},
    touchMove:{},
    touchEnd:{},
    swipe:{},
    swipeLeft:{},
    swipeRight:{},
    swipeUp:{},
    swipeDown:{},
    gestureStart:{},
    gestureMove:{},
    gestureEnd:{},
}

//touch events map, save to clean
const map={}

const self={
    getDetail:(el)=>{
        return el.getBoundingClientRect();
    },
    getTouchPoint:(ev,id)=>{
        if(!ev || !ev.touches) return [0,0];
        const evt=ev.touches[0];
        const pos = map[id].data.position;
        return [evt.clientX - pos[0],evt.clientY - pos[1]];
    },
    getGesturePoint:(ev,id)=>{
        if(!ev || !ev.touches) return [0,0];
        const f1=ev.touches[0],f2=ev.touches[1];
        const pos = map[id].data.position;
        return [
            (f2.clientX + f1.clientX)*0.5 - pos[0],
            (f2.clientY + f1.clientY)*0.5 - pos[1]
        ];
    },
    getDistance:(ev)=>{
        if(!ev || !ev.touches) return 0;
        const f1=ev.touches[0],f2=ev.touches[1];
        const dx = f1.clientX - f2.clientX;
        const dy = f1.clientY - f2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    },
    distancePoints:(pa,pb)=>{
        const dx = pa[0]-pb[0];
        const dy = pa[1]-pb[1];
        return Math.sqrt(dx * dx + dy * dy);
    },
    getStamp:()=>{
        return new Date().getTime();
    },
    resetGesture:(id)=>{

    },
    getListener:()=>{
        return {
            touchstart:(ev)=>{
                ev.preventDefault();
                ev.stopPropagation();

                const id=ev.currentTarget.getAttribute(config.key);
                const env=map[id].data;
                const point=self.getTouchPoint(ev,id);
                const now= self.getStamp();

                //doubletap event
                if(events.doubleTap[id] && env.stamp !==0 && env.start!==null ){
                    
                    const delta = now - env.stamp;
                    const dx = Math.abs(point[0] - env.start[0]);
                    const dy = Math.abs(point[1] - env.start[1]);
                    if (delta < config.delay && Math.sqrt(dx*dx+dy*dy) < config.distance) {
                        self.double(env.touch.start);
                    }
                    env.stamp=0;
                    env.start=null;
                    events.doubleTap[id](point);
                    return true;
                }else{
                    env.stamp=now;      //set tap timestamp to check double click
                }


                //singletap and touchstat
                if(ev.touches && ev.touches.length===1){
                    
                    if(events.singleTap[id]) events.singleTap[id](point);
                    if(events.touchStart[id]) events.touchStart[id](point);

                    env.start=point;    //set start point to check swipe
                    env.move.last=point;     //set touchmove point to calc distance
                }
                
                //Gesturestart event
                if(ev.touches && ev.touches.length===2){
                    const mid=self.getGesturePoint(ev,id);
                    const dis=self.getDistance(ev);
                    env.gesture.on=true;
                    env.gesture.last=mid;
                    env.gesture.distance=dis;
                    if(events.gestureStart[id]) events.gestureStart[id](mid);
                }
            },
            touchmove:(ev)=>{
                ev.preventDefault();
                ev.stopPropagation();

                const id=ev.currentTarget.getAttribute(config.key);
                const env=map[id].data;

                //touchmove event: 
                if(events.touchMove[id] && env.start!==null){
                    const point=self.getTouchPoint(ev,id);
                    const distance=self.distancePoints(point,env.move.last);
                    events.touchMove[id](point,distance);
                    env.move.last=point;
                } 
                
                //gesturemove event
                if(env.gesture.on && ev.touches.length===2 && env.start!==null){
                    const mid=self.getGesturePoint(ev,id);
                    const dis=self.getDistance(ev);
                    const delta=dis-env.gesture.distance;
                    if(delta===0){
                        const scale=1;
                        if(events.gestureMove[id]) events.gestureMove[id](mid,scale);
                    }else{
                        const scale=delta/env.gesture.distance;
                        if(events.gestureMove[id]) events.gestureMove[id](mid,scale);
                    }
                    env.gesture.last=mid;
                    env.gesture.distance=dis;
                }
            },
            touchend:(ev)=>{
                ev.preventDefault();
                ev.stopPropagation();

                const id=ev.currentTarget.getAttribute(config.key);
                const env=map[id].data;
                //console.log(ev,id)
                //const point=self.getTouchPoint(ev,id);
                const now= self.getStamp();

                //Gestureend event
                if(env.gesture.on && env.start!==null){
                    if(events.gestureEnd[id]) events.gestureEnd[id]();
                    //reset gesture
                    env.gesture.last=null;
                    env.gesture.distance=0;
                    env.gesture.on=false;
                }

                //Swipe event
                if( env.start!==null && 
                    env.move.last!==null && 
                    now - env.stamp < config.swipe.delay &&
                    (events.swipe[id] || 
                    events.swipeLeft[id] || 
                    events.swipeRight[id] || 
                    events.swipeUp[id] || 
                    events.swipeDown[id])
                ){
                    const dx = env.move.last[0] - env.last[0];
                    const dy = env.move.last[1] - env.last[1];

                    if(Math.abs(dx) > config.swipe.distance ){
                        if(dx>0){
                            if(events.swipeRight[id]) events.swipeRight[id](dx);
                        }else{
                            if(events.swipeLeft[id]) events.swipeLeft[id](dx);
                        }
                    }

                    if(Math.abs(dx) > config.swipe.distance ){
                        if(dy>0){
                            if(events.swipeDown[id]) events.swipeDown[id](dy);
                        }else{
                            if(events.swipeUp[id]) events.swipeUp[id](dy);
                        }
                    }

                    //if swipe, reset
                    env.start=null;
                    env.stamp=0;
                }

                //Touchend event
                if(events.touchEnd[id]){
                    const distance=self.distancePoints(point,env.move.last);
                    events.touchEnd[id](point,distance);
                    env.move.last=null;     //reset last 
                }

            },
        }
    },
    select:(id)=>{
        const arr=id.split(" ");
        if(arr.length===1){
            const el = document.getElementById(id);
            if (!el) return false;
            return el;
        }else{
            const el = document.querySelector(id);
            if (!el) return false;
            return el;
        }
    },
    clean:(id,el)=>{
        if(map[id]===undefined) return false;
        for(let event in map[id]){
            if(event==="data") continue;
            el.removeEventListener(event,map[id][event]);
        }
        delete map[id];
    },
};

const Touch={
    on:(id,event,callback)=>{
        //0. check dom and clean events;
        const el=self.select(id);
        if(el===false) return {error:"Invalid dom ID."};
        if(!events[event]) return {error:`Event "${event}" is not support.`}

        //1.reset binding
        self.clean(id,el);

        //2. set binding 
        events[event][id]=callback;
        el.setAttribute(config.key,id);
        map[id]=self.getListener();         //get listener and docking for removing

        //3. set dom basic parameters
        const rect=self.getDetail(el);
        map[id].data=JSON.parse(JSON.stringify(format));        //set map parameters
        map[id].data.size=[rect.width,rect.height];
        map[id].data.position=[rect.left,rect.top];
        
        //4.binding events
        el.addEventListener('touchstart', map[id].touchstart);
        el.addEventListener('touchmove', map[id].touchmove);
        el.addEventListener('touchend', map[id].touchend);
    },

    off:(id,event)=>{
        const el=self.select(id);
        if(el===false) return {error:"Invalid dom ID."};

    },
}

export default Touch;