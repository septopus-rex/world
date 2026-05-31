const config={
    node:{
        devnet:"https://winter-old-bridge.solana-devnet.quiknode.pro/982a105c0cf37e14d1977ecba41113f7ef2ea049",
        localnet:"http://localhost:8899",
        mainnet:"",
    },
    ipfs:{
        api:"http://localhost:5001",
        gateway:"http://localhost:8080",
    },
    env:"localnet",
    // localnet 部署地址（由 chain/target/deploy/septopus-keypair.json 决定）
    // devnet 地址在 IDL 里（4uJZCdH5...），无需在此设置
    programId:"65eQePybh9NABcLdm3EXCToEShDaD6AonA9zZru5w4M8",
    page:{
        step:18,
    }
}

export default config;
