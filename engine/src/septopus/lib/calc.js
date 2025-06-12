
const Calc={
    distance:(pa,pb)=>{
        const dx = pb[0] - pa[0];
        const dy = pb[1] - pa[1];
        return Math.sqrt(dx * dx + dy * dy);
    },

    reviseSizeOffset: (o, d, s) => {
        const fs = d > s ? s * 0.5 : d * .5 + o > s ? s - 0.5 * d : o < 0.5 * d ? 0.5 * d : o, sz = d > s ? s : d;
        return { offset: fs, size: sz }
    },
}

export default Calc