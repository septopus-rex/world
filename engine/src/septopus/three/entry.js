/**
 * Three.js object entry 
 * @there.js R175
 * @fileoverview
*  1. group all three.js functions
*  2. check valid of input
*  3. modify the default parameters of three objects.
 *
 * @author Fuu
 * @date 2025-04-24
 */

import Scene from "./basic/scene";
import Camera from "./basic/camera";
import Render from "./basic/renderer";
import Mesh from "./basic/mesh";
import Group from "./basic/group";
import Sky from "./basic/sky";

import light_direct from "./light/light_direct";
import light_point from "./light/light_point";
import light_spot from "./light/light_spot";
import light_sun from "./light/light_sun";

import geometry_box from "./geometry/ge_box";
import geometry_line from "./geometry/ge_line";
import geometry_plane from "./geometry/ge_plane";
import geometry_tube from "./geometry/ge_tube";
import geometry_ball from "./geometry/ge_ball";
import geometry_cylinder from "./geometry/ge_cylinder";

import texture_basic from "./texture/tx_basic";
import material_meshphong from "./material/mt_meshphong";
import material_meshbasic from "./material/mt_meshbasic";

import extend_grid from "./extend/grid";

const router={
    basic:{
        render:Render,
        camera:Camera,
        scene:Scene,
        mesh:Mesh,
        group:Group,
        sky:Sky,             
    },
    light:{
        spot:light_spot,
        direct:light_direct,
        sun:light_sun,
        point:light_point
    },
    texture:{
        basic:texture_basic, 
        cube:null,
    },
    material:{
        meshbasic:material_meshbasic,
        meshdepth:null,
        meshphong:material_meshphong,
        linebasic:null,
        linedashed:null,
    },
    geometry:{
        line: null,                 //line is isolated, not just geometry
        plane:geometry_plane,
        box: geometry_box,
        ball: geometry_ball,
        cylinder:geometry_cylinder,
        tube:geometry_tube,         //for Septopus Rex
    },
    extend:{
        grid:extend_grid,       //Location gird
        pano:null,              //cube pano sky
        outline:null,           //adjunct outline
    },
    loader:{            //3D module loader
        ds3:null,
        fxb:null,
        mmd:null,
        dae:null,
        json:null,
    },
}

const self = {
    valid:()=>{

    },
    transform:(arr)=>{
        return [arr[0],arr[2],-arr[1]];
    },

};

const ThreeObject = {
    //Entry to get geometry, material
    get: (cat, mod, params) => {
        if(!router[cat] || !router[cat][mod]) return {error:`Invalid three object: ${cat} ${mod}`}

        //console.log(params);
        if(params.size) params.size=[
            params.size[0],
            params.size[2],
            params.size[1]
        ];
        return router[cat][mod].create(params);
    },

    mesh:(geo,mt,position,rotation)=>{
        //console.log(JSON.stringify(geo));
        if(geo===undefined ||
            mt===undefined ||
            position===undefined ||
            rotation===undefined) return {error:"Invalid parameters."}

        const gg=ThreeObject.get("geometry",geo.type,geo.params);
        if(gg.error) return {error:gg.error};

        const mm=ThreeObject.get("material",mt.type,mt.params);
        if(mm.error) return {error:mm.error};

        const mesh=ThreeObject.get("basic","mesh",{geometry:gg,material:mm});

        //mesh.position.set(...position);
        

        mesh.position.set(...self.transform(position));
        mesh.rotation.set(...rotation);

        return {mesh:mesh,material:mm};
    },

    line:(points,mt,position,rotation)=>{

    },

    group:(objs,position,rotation)=>{

    },
}

export default ThreeObject