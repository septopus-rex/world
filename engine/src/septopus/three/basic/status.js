/**
 * Three.js status function 
 * @there.js R175
 * 
 * @fileoverview
 * 1. create state of three.js
 *
 * @author Fuu
 * @date 2025-08-25
 */

import Stats from 'stats.js';

const Status={
    create:(cfg)=>{
        const stats = new Stats();
        if(cfg.left||cfg.top) stats.dom.style.position = 'fixed';
        if(cfg.left) stats.dom.style.left = cfg.left;
        if(cfg.top) stats.dom.style.top = cfg.top;
        return stats;
    }
}

export default Status;