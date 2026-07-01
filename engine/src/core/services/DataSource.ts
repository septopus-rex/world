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
     * Resolve a Game Setting resource (game.md §2): the playable block's `game`
     * field carries this resource id. Returns the GameSetting, or null if the id
     * resolves to nothing (then the block is a bare playable zone with no game).
     * Optional — a host with no games omits it and GameRuntimeSystem stays inert.
     */
    gameSetting?(id: number): Promise<import('../types/GameSetting').GameSetting | null>;
}
