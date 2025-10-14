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
import Status from "./basic/status";
import Raycast from "./basic/raycast";
import Helper from "./basic/helper";
import Loader from "./basic/loader";
import Clock from "./basic/clock";
import Box from "./basic/box3";
import Vector from "./basic/vector";
import Skeleton from "./basic/skeleton";
import Mixer from "./basic/mixer";
import Controller from "./basic/controller";

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
import geometry_cone from "./geometry/ge_cone";

import texture_basic from "./texture/tx_basic";
import material_meshphong from "./material/mt_meshphong";
import material_meshbasic from "./material/mt_meshbasic";
import material_meshstandard from "./material/mt_meshstandard";

import extend_grid from "./extend/grid";

const router={
    basic:{
        render:Render,
        camera:Camera,
        scene:Scene,
        mesh:Mesh,
        group:Group,
        sky:Sky, 
        raycast:Raycast, 
        helper:Helper, 
        loader:Loader, 
        status:Status,
        clock:Clock,
        box:Box,
        vector:Vector,      
        skeleton:Skeleton,
        mixer:Mixer,
        controller:Controller,
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
        meshstandard:material_meshstandard,
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
        cone:geometry_cone,
    },
    extend:{
        grid:extend_grid,       //Location gird
        pano:null,              //cube pano sky
        outline:null,           //adjunct outline
    },
    // loader:{            //3D module loader
    //     ds3:null,
    //     fbx:null,
    //     mmd:null,
    //     dae:null,
    //     json:null,
    // },
}

const self = {
    valid:()=>{

    },

    //!important, transform rule between three.js and Septopus.
    transform:(arr)=>{
        return [arr[0],arr[2],-arr[1]];
    },
};

const ThreeObject = {
    /** 
     * Entry to get geometry, material and objects on Three.js
     * @functions
     * 1.create 3D objects
     * 2.change the coordination system from three.js to Septopus world
     * @param   {string}    cat      - category of 3D object
     * @param   {string}    mod      - name of 3D object
     * @param   {object}    params   - parameters for creating 3D object
     * @returns
     * @return objects
     */
    get: (cat, mod, params) => {

        //1. check validation
        if(!router[cat] || !router[cat][mod]) return {error:`Invalid three object: ${cat} ${mod}`}


        //2. coordination adaptation
        //!important,change size of 3D object
        if(params && params.size) params.size=[
            params.size[0],
            params.size[2],
            params.size[1]
        ];

        //3.create 3D object
        return router[cat][mod].create(params);
    },

    boundy:(model)=>{
        // 1. create Bounding Box object
        const b3=ThreeObject.get("basic","box");
        const box = b3.setFromObject(model);

        // 2. Dimension Vector calculation
        // box.max - box.min to get THREE.Vector3, model size
        const size = ThreeObject.get("basic","vector");
        box.getSize(size);

        // 3. Center Point calculation
        const center = ThreeObject.get("basic","vector");
        box.getCenter(center);
        
        return {
            width: size.x,
            height: size.y,
            depth: size.z,
            center: center
        };
    },

    /** 
     * Create Mesh for renderer.
     * @functions
     * 1.create 3D mesh
     * 2.change the coordination system from three.js to Septopus world
     * @param   {object}    geo      - three.js geometry for creating mesh
     * @param   {object}    mt       - {type:"TYPE_OF_MATERIAL",params:{}}, material parameters
     * @param   {array}     position - [x,y,z], position of mesh
     * @param   {array}     rotation - [rx,ry,rz], rotation of mesh
     * @returns
     * @return {object}  - {mesh:Object,material:Object}
     */
    mesh:(geo,mt,position,rotation)=>{
        if(geo===undefined ||
            mt===undefined ||
            position===undefined ||
            rotation===undefined) return {error:"Invalid parameters."}

        const gg=ThreeObject.get("geometry",geo.type,geo.params);
        if(gg.error) return {error:gg.error};

        const mm=ThreeObject.get("material",mt.type,mt.params);
        //console.log(mt);
        if(mm.error) return {error:mm.error};

        const mesh=ThreeObject.get("basic","mesh",{geometry:gg,material:mm});

        //!important, transform the coordination
        //mesh.position.set(...position);
        //mesh.rotation.set(...rotation); 
        mesh.position.set(...self.transform(position));
        mesh.rotation.set(...self.transform(rotation));

        return {mesh:mesh,material:mm};
    },
}

export default ThreeObject