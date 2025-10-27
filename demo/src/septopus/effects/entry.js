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
import Move from "./mesh/move";
import Scale from "./mesh/scale";
import Texture from "./mesh/texture";
import Color from "./mesh/color";
import Opacity from "./mesh/opacity";
import Morph from "./mesh/morph";

const reg = {
    name: "effects",
    category: 'lib',
    desc: "",
    version: "1.0.0",
    events: ["start", "end"],
}

const config = {
    frame: 60,           //frame rate, 60fps
}

const active = {
    camera: null,
    scene: null,
}

const self = {
    hooks: {
        reg: () => {
            return reg;
        },
    },
    getPeriod: (time, duration, ends) => {
        const period = [0, 0];
        if (!time) period[1] = duration;
        if (Array.isArray(time)) {
            period[0] = time[0];
            period[1] = time[1];
        } else {
            period[0] = time;
            period[1] = duration;
        }

        period[0] += ends[0];
        period[1] += ends[0];

        return period;
    },
    insertBreakpoint: (period, line) => {
        //console.log(`Break ${JSON.stringify(line)} by period ${JSON.stringify(period)}`);
        //1. start point
        const start = period[0];
        if (start && !line.includes(start)) {
            const index = line.findIndex(element => start <= element);
            if (index !== -1) {
                line.splice(index, 0, start);
            }
        }

        //2. end point
        const end = period[1];
        if (!line.includes(end)) {
            const index = line.findIndex(element => end <= element);
            if (index !== -1) {
                line.splice(index, 0, end);
            }
        }
        return line;
    },
    getBreakpoint: (duration, timeline, pending) => {
        const ends = [0, 0];
        if (pending) {
            if (Array.isArray(pending)) {
                ends[0] = pending[0];
                ends[1] = pending[1];
            } else {
                ends[0] = pending;
            }
        }
        let line = [0, ends[0] + ends[1] + duration];
        if (ends[1] !== 0) line = self.insertBreakpoint([line[1] - ends[1], line[1]], line);
        if (ends[0] !== 0) line = self.insertBreakpoint([0, ends[0]], line);
        for (let i = 0; i < timeline.length; i++) {
            const row = timeline[i];
            const period = self.getPeriod(row.time, duration, ends);
            line = self.insertBreakpoint(period, line)
        }
        return line;
    },
    getAxis: (str) => {
        const arr = str.split("");
        const ax = { x: false, y: false, z: false };
        for (let i = 0; i < arr.length; i++) {
            const key = arr[i].toLocaleLowerCase();
            ax[key] = true;
        }
        return ax;
    },
    getPrecision: (num) => {
        const numStr = num.toString();

        const decimalIndex = numStr.indexOf('.');
        if (decimalIndex === -1)return 1;

        const decimalPart = numStr.substring(decimalIndex + 1);
        const decimalLength = decimalPart.length;
        
        return Math.pow(10, -decimalLength);
    },
    getStatus: (std, n) => {
        const breakpoints = self.getBreakpoint(std.duration, std.timeline, std.pending);
        const end = breakpoints[breakpoints.length - 1];
        const per = 1000 / config.frame;
        const status = {
            start: n,
            end: n + Math.round(end / per),
            counter: 0,
            round: {          //whole loop counter
                limit: std.loops,        //
                now: 0,
            },
            section: breakpoints,                 //animation section
            //actions:[],
        }
        //console.log(JSON.stringify(status));
        return status;
    },

    action: (step, timeline, meshes, status, category) => {
        //console.log(`Actual action`,step,JSON.stringify(status.section));
        const point = Math.round(step * 1000 / config.frame);

        console.log(point);
    },

    simple: (std, category) => {
        return (meshes, n) => {
            for (let i = 0; i < std.timeline.length; i++) {
                const row = std.timeline[i];
                if (!router[category] || !router[category][row.type]) continue;
                if (typeof row.axis === "string") row.axis = self.getAxis(row.axis);
                router[category][row.type]({ mesh: meshes }, row, n);
            }
        }
    },
    complex: (std, category) => {
        let status = null;
        return (meshes, n) => {
            if (status === null) status = self.getStatus(std, n);

            //1. check wether round ends
            const step = n - status.start;
            if (n === status.end) {
                status.round.now++;
                //console.log(`Round ${status.round.now} of ${std.name}`);
                if (status.round.limit !== 0) {
                    if (status.round.now >= status.round.limit) {
                        console.log(`Rounds end of ${std.name}, total ${status.round.now}`);
                        return false;
                    }
                }
                const full = status.end - status.start;
                status.start = n;
                status.end = n + full;
            }

            //2. action by step
            const point = Math.round(step * 1000 / config.frame);
            const ends = [0, 0];
            if (std.pending) {
                if (Array.isArray(std.pending)) {
                    ends[0] = std.pending[0];
                    ends[1] = std.pending[1];
                } else {
                    ends[0] = std.pending;
                }
            }

            for (let i = 0; i < std.timeline.length; i++) {
                const row = std.timeline[i];
                if (!router[category] || !router[category][row.type]) continue;
                if (typeof row.axis === "string") row.axis = self.getAxis(row.axis);
                if (!row.time) {
                    router[category][row.type]({ mesh: meshes }, row, step);
                } else {
                    const time = row.time;
                    if (Array.isArray(time)) {
                        if (point < time[0] + ends[0] || point > time[1] + ends[0]) continue;
                        router[category][row.type]({ mesh: meshes }, row, step);
                    } else {
                        if (point < time[0] + ends[0]) continue;
                        router[category][row.type]({ mesh: meshes }, row, step);
                    }
                }
            }
        }
    },
}

const router = {
    camera: {
        fall: Fall,
        linger: Linger,
    },
    scene: {
        lightning: Lightning,
    },
    mesh: {
        rotate: Rotate,
        move: Move,
        scale: Scale,
        texture: Texture,
        color: Color,
        opacity: Opacity,
        morph: Morph,
    },
};


const vbw_effects = {
    hooks: self.hooks,
    /** 
     * set camera for effects
     * @functions
     * 1.set camera for effects
     * 
     * @param   {object}    cam   - parameters for creating 3D object
     * @returns
     * @return {boolean}
     */
    set: (cam, sce) => {
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

    get: (cat, type, params, ck) => {
        if (!router[cat] || !router[cat][type]) return { error: "Invalid effects." };
        return router[cat][type](params, active, ck);
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
    group: (list) => {

    },

    /** 
     * Standard animation decodor
     * @functions
     * 1.multi effects
     * 
     * @param   {object[]}  std         - STD animation, check the doc to get details
     * @param   {string}    catetory    - STD animation, check the doc to get details
     * @returns
     * @return {function}
     */
    decode: (std, category) => {
        if (!std.loops && !std.duration) {
            return self.simple(std, category);
        }

        return self.complex(std, category);
    },
}

export default vbw_effects;