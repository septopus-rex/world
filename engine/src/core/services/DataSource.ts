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
     * Resolve a Game Setting resource (game.md §2): the playable block's `game`
     * field carries this resource id. Returns the GameSetting, or null if the id
     * resolves to nothing (then the block is a bare playable zone with no game).
     * Optional — a host with no games omits it and GameRuntimeSystem stays inert.
     */
    gameSetting?(id: number): Promise<import('../types/GameSetting').GameSetting | null>;
}
