/**
 * IChainPublisher
 * Interface for publishing edited block data to a blockchain.
 * 
 * Flow: raw → IPFS.pin() → CID → chain.commitBlock(key, cid) → tx hash
 * 
 * Implementations:
 *   - SolanaPublisher (primary)
 *   - EthPublisher, AptosPublisher etc. (future extensibility)
 */
export interface IChainPublisher {
    /**
     * Upload raw block data to decentralized storage (IPFS/Arweave).
     * @returns Content identifier (CID or URI)
     */
    uploadData(raw: any): Promise<string>;

    /**
     * Commit the content reference to the blockchain.
     * @param blockKey  Block coordinates as "x_y"
     * @param cid       Content identifier from uploadData
     * @returns Transaction hash or signature
     */
    commitBlock(blockKey: string, cid: string): Promise<string>;
}
