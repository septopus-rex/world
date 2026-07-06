export interface IDataSource {
    /** 
     * Get world-specific configuration (physics, baseline)
     */
    world(index: number): Promise<any>;

    /** 
     * Get block data in a specific area
     */
    view(x: number, y: number, ext: number, worldIndex: number): Promise<any>;

    /** 
     * Get 3D module definitions
     */
    module(ids: number[]): Promise<any>;

    /**
     * Get texture definitions
     */
    texture(ids: number[]): Promise<any>;

    /**
     * Get audio definitions (record shape: { raw, format }, raw = CID/URL/path —
     * resolved the same way as models/textures). Optional and first-class: a host
     * that provides it gives audio its own channel; ResourceManager falls back to
     * module() when it is absent, so existing sources keep working unchanged.
     */
    audio?(ids: number[]): Promise<any>;

    /**
     * Get video definitions (record shape: { raw, format }, raw = CID/URL/path).
     * Optional and first-class, same as audio(); ResourceManager falls back to
     * module() when absent.
     */
    video?(ids: number[]): Promise<any>;

    /**
     * Resolve external SPP StylePacks by ref (id / URL / IPFS CID). Returns a
     * record ref → StylePack JSON. Optional and first-class: a host that stores
     * styles off-chain provides it so SPP sources can reference packs by CID;
     * when absent, only the built-in bundled packs (basic/brick/garden/coaster)
     * are available. The engine expands synchronously, so a host resolves +
     * Engine.registerStylePack BEFORE the referencing block streams in.
     * Spec: docs/plan/specs/spp-protocol-full.md §3.B.
     */
    stylePack?(refs: string[]): Promise<Record<string, import('../spp/Variants').StylePack>>;

    /**
     * Resolve a Game Setting resource (game.md §2): the playable block's `game`
     * field carries this resource id. Returns the GameSetting, or null if the id
     * resolves to nothing (then the block is a bare playable zone with no game).
     * Optional — a host with no games omits it and GameRuntimeSystem stays inert.
     */
    gameSetting?(id: number): Promise<import('../types/GameSetting').GameSetting | null>;
}
