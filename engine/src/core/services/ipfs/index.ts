/**
 * IPFS — content-addressed resource layer (mock-first, swappable for real IPFS).
 * See docs/plan/specs/mock-ipfs-resource.md.
 *
 *   CID → IpfsRouter → IpfsProvider → bytes
 */
export { cidForBytes, isCid } from './Cid';
export type { IpfsProvider } from './IpfsProvider';
export { MemoryCasProvider } from './MemoryCasProvider';
export { IpfsRouter } from './IpfsRouter';
