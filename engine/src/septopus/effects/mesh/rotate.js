/**
 * Effects -  mesh rotate
 *
 * @fileoverview
 *  1. mesh rotate effect
 *
 * @author Fuu
 * @date 2025-09-08
 */


const Rotate = (meshes,cfg) => {
    // const {meshes,config} = todo;
    console.log(cfg);
    for(let i=0;i<meshes.length;i++){
        const mesh=meshes[i];
        //console.log(mesh);
        mesh.rotation.x+=cfg.value;
        mesh.rotation.y+=cfg.value;
        mesh.rotation.z+=cfg.value;
    }
}

export default Rotate;