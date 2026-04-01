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
}
