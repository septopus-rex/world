/**
 * Effects - 3D effect constructor
 *
 * @fileoverview
 *  1. entry of effects
 *  2. camera effects support
 *  3. mesh effects suport
 *  4. scene effects support
 *
 * @author Fuu
 * @date 2025-07-28
 */

import Fall from "./camera/fall";
import Linger from "./camera/linger";
import Lightning from "./scene/lightning";
import Rotate from "./mesh/rotate";
import Moving from "./mesh/moving";
import Scale from "./mesh/scale";
import Texture from "./mesh/texture";
import Color from "./mesh/color";
import Opacity from "./mesh/opacity";
import Morph from "./mesh/morph";

const reg={
    name:"effects",
    category:'lib',         
    desc:"",
    version:"1.0.0",
    //events:["start"],
}

const config={
    frame:60,           //frame rate, 60fps
}

const active={
    camera:null,
    scene:null,
}

const self={
    hooks:{
        reg:()=>{
            return reg;
        },
    },
    getPeriod:(time,duration,ends)=>{
        const period=[0,0];
        if(!time) period[1]=duration;
        if(Array.isArray(time)){
            period[0]=time[0];
            period[1]=time[1];
        }else{
            period[0]=time;
            period[1]=duration;
        }

        period[0]+=ends[0];
        period[1]+=ends[0];

        return period;
    },
    insertBreakpoint:(period,line)=>{
        //console.log(`Break ${JSON.stringify(line)} by period ${JSON.stringify(period)}`);
        //1. start point
        const start=period[0];
        if(start && !line.includes(start)){
            const index = line.findIndex(element => start <= element);
            if (index !== -1){
                line.splice(index, 0, start);
            }
        }

        //2. end point
        const end=period[1];
        if(!line.includes(end)){
            const index = line.findIndex(element => end <= element);
            if (index !== -1){
                line.splice(index, 0, end);
            }
        }
        return line;
    },
    getBreakpoint:(duration,timeline,pending)=>{
        const ends=[0,0];
        if(pending){
            if(Array.isArray(pending)){
                ends[0]=pending[0];
                ends[1]=pending[1];
            }else{
                ends[0]=pending;
            }
        }
        let line=[0,ends[0]+ends[1]+duration];
        if(ends[1]!==0) line=self.insertBreakpoint([line[1]-ends[1],line[1]],line);
        if(ends[0]!==0) line=self.insertBreakpoint([0,ends[0]],line);
        for(let i=0;i<timeline.length;i++){
            const row=timeline[i];
            const period=self.getPeriod(row.time,duration,ends);
            //console.log(period);
            line=self.insertBreakpoint(period,line)
        }
        return line;
    },
    getAxis:(str)=>{
        const arr=str.split("");
        const ax={x:false,y:false,z:false};
        for(let i=0;i<arr.length;i++){
            const key=arr[i].toLocaleLowerCase();
            ax[key]=true;
        }
        return ax;
    },
    getStatus:(std,n)=>{
        const breakpoints=self.getBreakpoint(std.duration,std.timeline,std.pending);
        const end=breakpoints[breakpoints.length-1];
        const status={
                    start:n,
                    end:n + 999,
                    check:0,
                    round:{          //whole loop counter
                        limit:std.loops,        //
                        now:0,
                    },           
                    section:breakpoints,                 //animation section
                    actions:[],
                }
        return status;
    },

    simple:(std,category)=>{
        return (meshes,n)=>{
            for(let i=0;i<std.timeline.length;i++){
                const row=std.timeline[i];
                if(!router[category] || !router[category][row.type] ) continue;
                if(typeof row.axis==="string") row.axis=self.getAxis(row.axis);
                router[category][row.type]({mesh:meshes},row);
            }
        }
    },
    complex:(std,category)=>{
        let status=null;
        return (meshes,n)=>{
            if(status===null) status=self.getStatus(std,n);
            //const step= n - status.start;
            if(n>10) return false;

            //status.check++;
            //console.log(JSON.stringify(std));
            //console.log(JSON.stringify(status));
        }
    },
}

const router={
    camera:{
        fall:Fall,
        linger:Linger,
    },
    scene:{
        lightning:Lightning,
    },
    mesh:{
        rotate:Rotate,
        moving:Moving,
        scale:Scale,
        texture:Texture,
        color:Color,
        opacity:Opacity,
        morph:Morph,
    },
};


const vbw_effects = {
    hooks:self.hooks,
    /** 
     * set camera for effects
     * @functions
     * 1.set camera for effects
     * 
     * @param   {object}    cam   - parameters for creating 3D object
     * @returns
     * @return {boolean}
     */
    set:(cam,sce)=>{
        active.camera = cam;
        active.scene = sce;
        return true;
    },
    
    /** 
     * Entry to get effects,
     * @functions
     * 1.create 3D objects
     * 2.change the coordination system from three.js to Septopus world
     * @param   {string}    cat      - category of effect, ["camera","scene","mesh"]
     * @param   {string}    type     - type of effect
     * @param   {object}    params   - parameters for effect
     * @param   {function}  ck       - callback function when effect done
     * @returns
     * @return {callback}
     */

    get:(cat,type,params,ck)=>{
        if(!router[cat] || !router[cat][type]) return {error:"Invalid effects."};

        return router[cat][type](params,active,ck);
    },

    /** 
     * Entry to get effects,
     * @functions
     * 1.multi effects
     * 
     * @param   {object[]}    list      - category of effect, ["camera","scene"]
     * @returns
     * @return {boolean}
     */
    group:(list)=>{

    },

    /** 
     * Standard animation decodor (for mesh)
     * @functions
     * 1.multi effects
     * 
     * @param   {object[]}  std         - STD animation, check the doc to get details
     * @param   {string}    catetory    - STD animation, check the doc to get details
     * @returns
     * @return {function}
     */
    decode:(std,category)=>{
        if(!std.loops && !std.duration){
            return self.simple(std,category);
        }
        
        return self.complex(std,category);
    },
}

export default vbw_effects;