import config from "../config";

const isCID = (str) => {
    if (!str || typeof str !== "string") return false;
    return str.startsWith("Qm") || str.startsWith("bafy") || str.startsWith("bafk");
};

const IPFS = {
    isCID,

    // Fetch block content by CID, returns parsed JSON
    get: async (cid) => {
        const gateway = config.ipfs?.gateway ?? "https://ipfs.io";
        const res = await fetch(`${gateway}/ipfs/${cid}`);
        if (!res.ok) throw new Error(`IPFS fetch failed [${res.status}]: ${cid}`);
        return await res.json();
    },

    // Upload data to IPFS node, returns CID string
    add: async (data) => {
        const api = config.ipfs?.api;
        if (!api) throw new Error("IPFS API endpoint not configured");
        const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
        const form = new FormData();
        form.append("file", blob);
        const res = await fetch(`${api}/api/v0/add`, { method: "POST", body: form });
        if (!res.ok) throw new Error(`IPFS add failed [${res.status}]`);
        const json = await res.json();
        return json.Hash;
    },
};

export default IPFS;
