
const Calc={
    distance:(pa,pb)=>{
        const dx = pb[0] - pa[0];
        const dy = pb[1] - pa[1];
        return Math.sqrt(dx * dx + dy * dy);
    },
}

export default Calc