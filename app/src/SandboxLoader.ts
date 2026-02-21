import { World } from 'spp-engine';
import { AdjunctComponent } from 'spp-engine/dist/core/components/AdjunctComponents';
import { TransformComponent } from 'spp-engine/dist/core/components/PlayerComponents';
import { BasicBoxAdjunct } from 'spp-engine/dist/plugins/adjunct/basic_box';

export class SandboxLoader {
    private world: World | null = null;
    private boxEntityId: number | null = null;

    public init(containerId: string) {
        if (this.world) return;

        // 1. Initialize ECS World
        this.world = new World({
            world: {
                containerId: containerId,
                name: "Render Sandbox",
                desc: "Testing Adjuncts",
                range: [4096, 4096],
                block: [16, 16, 32],
                diff: 4,
                max: 99
            },
            time: { speed: 1, year: 12, month: 30, day: 24, hour: 60, minute: 60, second: 1000 },
            sky: { sun: 1, moon: 3 },
            weather: { category: ["cloud"], grading: 8, detail: {}, degree: 40 }
        });

        // 2. Start the simulation loop
        this.world.start();
        
        // 3. Spawn the ported Basic Box Adjunct
        this.spawnTestBox();
    }
    
    public getBoxMenu() {
        return BasicBoxAdjunct.menu.sidebar(this.getBoxData());
    }
    
    public getBoxData() {
        if (!this.world || !this.boxEntityId) return null;
        const comp = this.world.getComponent<AdjunctComponent>(this.boxEntityId, "AdjunctComponent");
        if (comp) {
            return comp.stdData.params;
        }
        return null;
    }
    
    public updateBoxData(key: string, value: number) {
        if (!this.world || !this.boxEntityId) return;
        
        const comp = this.world.getComponent<AdjunctComponent>(this.boxEntityId, "AdjunctComponent");
        if (comp) {
            // Update the underlying data
            if(comp.stdData.params.size[0] && key === 'x') comp.stdData.params.size[0] = value;
            if(comp.stdData.params.size[1] && key === 'y') comp.stdData.params.size[1] = value;
            if(comp.stdData.params.size[2] && key === 'z') comp.stdData.params.size[2] = value;
            
            if(key === 'ox') comp.stdData.params.position[0] = value;
            if(key === 'oy') comp.stdData.params.position[1] = value;
            if(key === 'oz') comp.stdData.params.position[2] = value;
            
            // Force re-render
            if ((comp as any)._mesh) {
                this.world.scene.remove((comp as any)._mesh);
            }
            comp.isInitialized = false;
        }
    }

    private spawnTestBox() {
        if (!this.world) return;

        this.boxEntityId = this.world.createEntity();
        
        // Add spatial placement
        this.world.addComponent<TransformComponent>(this.boxEntityId, "TransformComponent", {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
        });

        // Add SPP standard payload data
        this.world.addComponent<AdjunctComponent>(this.boxEntityId, "AdjunctComponent", {
            adjunctId: "box_001",
            isInitialized: false,
            logicModule: BasicBoxAdjunct,
            stdData: {
                type: "box",
                params: {
                    size: [2, 2, 2],    // Initial dimensions (X, Y, Z)
                    position: [0, 0, 0], // Anchor offset
                    rotation: [0, 0, 0]  // Orientation
                },
                material: {
                    color: 0xff5555  // Distinct red for sandbox
                },
                animate: {
                    router: { name: "rotateY" }
                }
            }
        });
    }
}
