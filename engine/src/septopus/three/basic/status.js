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
        stats.dom.style.position = 'fixed';
        stats.dom.style.left = '450px';
        stats.dom.style.top = '20px';
        return stats;
    }
}

export default Status;