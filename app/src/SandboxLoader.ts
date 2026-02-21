import { World } from '../../engine/src/core/World';
import type { AdjunctComponent } from '../../engine/src/core/components/AdjunctComponents';
import type { TransformComponent } from '../../engine/src/core/components/PlayerComponents';
import { BasicBoxAdjunct } from '../../engine/src/plugins/adjunct/basic_box';
import { BasicSphereAdjunct } from '../../engine/src/plugins/adjunct/basic_sphere';
import { BasicConeAdjunct } from '../../engine/src/plugins/adjunct/basic_cone';
import { BasicTriggerAdjunct } from '../../engine/src/plugins/adjunct/basic_trigger';
import { BasicWallAdjunct } from '../../engine/src/plugins/adjunct/basic_wall';
import { BasicWaterAdjunct } from '../../engine/src/plugins/adjunct/basic_water';
import type { TriggerComponent } from '../../engine/src/core/components/TriggerComponent';
import { MockWorldNormal } from '../../engine/src/core/mocks/WorldConfigs';

export class SandboxLoader {
    public world: World | null = null;
    private selectedEntityId: number | null = null;
    private boxEntityId: number | null = null;
    private sphereEntityId: number | null = null;
    private coneEntityId: number | null = null;
    private triggerEntityId: number | null = null;
    private wallEntityId: number | null = null;
    private waterEntityId: number | null = null;

    public init(containerId: string) {
        if (this.world) return;

        // 1. Initialize ECS World with valid Mock Config
        const config = JSON.parse(JSON.stringify(MockWorldNormal));
        config.world.containerId = containerId;

        this.world = new World(config);

        // 2. Spawn the ported Adjuncts
        this.spawnTestBox();
        this.spawnTestSphere();
        this.spawnTestCone();
        this.spawnTestTrigger();
        this.spawnTestWall();
        this.spawnTestWater();
    }

    public getSelectedMenu() {
        const data = this.getSelectedData();
        if (!data) return null;

        const adjunct = this.world?.getComponent<AdjunctComponent>(this.selectedEntityId!, "AdjunctComponent");
        if (adjunct?.logicModule?.menu?.sidebar) {
            return adjunct.logicModule.menu.sidebar(data);
        }
        return null;
    }

    public getSelectedData() {
        if (!this.world || this.selectedEntityId === null) return null;
        const comp = this.world.getComponent<AdjunctComponent>(this.selectedEntityId, "AdjunctComponent");
        if (comp) {
            return comp.stdData.params;
        }
        return null;
    }

    public updateSelectedData(key: string, value: number) {
        if (!this.world || this.selectedEntityId === null) return;

        const comp = this.world.getComponent<AdjunctComponent>(this.selectedEntityId, "AdjunctComponent");
        if (comp) {
            // Update the underlying data
            const params = comp.stdData.params;
            if (key === 'x') params.size[0] = value;
            if (key === 'y') params.size[1] = value;
            if (key === 'z') params.size[2] = value;
            if (key === 'radius') params.size[0] = value * 2;
            if (key === 'radiusBottom') params.size[0] = value;
            if (key === 'height') params.size[1] = value;
            if (key === 'radiusTop') params.size[2] = value;

            if (key === 'ox') params.position[0] = value;
            if (key === 'oy') params.position[1] = value;
            if (key === 'oz') params.position[2] = value;

            if (key === 'rx') params.rotation[0] = value;
            if (key === 'ry') params.rotation[1] = value;
            if (key === 'rz') params.rotation[2] = value;

            // Force re-render - in a real engine we'd have a system for this
            // but for the sandbox we just clear the mesh and re-init
            if ((comp as any)._mesh) {
                this.world.scene.remove((comp as any)._mesh);
                delete (comp as any)._mesh;
            }
            comp.isInitialized = false;
        }
    }

    public selectBox() { this.selectedEntityId = this.boxEntityId; }
    public selectSphere() { this.selectedEntityId = this.sphereEntityId; }
    public selectCone() { this.selectedEntityId = this.coneEntityId; }
    public selectTrigger() { this.selectedEntityId = this.triggerEntityId; }
    public selectWall() { this.selectedEntityId = this.wallEntityId; }
    public selectWater() { this.selectedEntityId = this.waterEntityId; }

    private spawnTestBox() {
        if (!this.world) return;

        this.boxEntityId = this.world.createEntity();
        this.selectedEntityId = this.boxEntityId; // Default selection

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
                    size: [2, 2, 2],
                    position: [0, 0, 0],
                    rotation: [0, 0, 0]
                },
                material: { color: 0xff5555 },
                animate: { router: { name: "rotateY" } }
            }
        });
    }

    private spawnTestSphere() {
        if (!this.world) return;

        this.sphereEntityId = this.world.createEntity();

        this.world.addComponent<TransformComponent>(this.sphereEntityId, "TransformComponent", {
            position: [5, 2, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
        });

        this.world.addComponent<AdjunctComponent>(this.sphereEntityId, "AdjunctComponent", {
            adjunctId: "sphere_001",
            isInitialized: false,
            logicModule: BasicSphereAdjunct,
            stdData: {
                type: "sphere",
                params: {
                    size: [2, 2, 2],
                    position: [5, 0, 0], // Put them on the floor (relative to elevation 2)
                    rotation: [0, 0, 0]
                },
                material: { color: 0x55ff55 }
            }
        });
    }

    private spawnTestCone() {
        if (!this.world) return;

        this.coneEntityId = this.world.createEntity();

        this.world.addComponent<TransformComponent>(this.coneEntityId, "TransformComponent", {
            position: [-5, 2, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
        });

        this.world.addComponent<AdjunctComponent>(this.coneEntityId, "AdjunctComponent", {
            adjunctId: "cone_001",
            isInitialized: false,
            logicModule: BasicConeAdjunct,
            stdData: {
                type: "cone",
                params: {
                    size: [1, 2, 0], // radiusBottom, height, radiusTop
                    position: [-5, 0, 0],
                    rotation: [0, 0, 0]
                },
                material: { color: 0x5555ff }
            }
        });
    }

    private spawnTestTrigger() {
        if (!this.world) return;

        this.triggerEntityId = this.world.createEntity();

        this.world.addComponent<TransformComponent>(this.triggerEntityId, "TransformComponent", {
            position: [0, 2, -5],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
        });

        // The visual representation (optional)
        this.world.addComponent<AdjunctComponent>(this.triggerEntityId, "AdjunctComponent", {
            adjunctId: "trigger_001",
            isInitialized: false,
            logicModule: BasicTriggerAdjunct,
            stdData: {
                type: "box",
                params: {
                    size: [5, 2, 5],
                    position: [0, 0, -5],
                    rotation: [0, 0, 0]
                },
                material: { color: 0xff3298, opacity: 0.3 }
            }
        });

        // The actual logic volume
        this.world.addComponent<TriggerComponent>(this.triggerEntityId, "TriggerComponent", {
            shape: 'box',
            size: [5, 2, 5],
            offset: [0, 0, 0],
            entitiesInside: new Set(),
            triggeredCount: {},
            showHelper: true,
            events: [
                {
                    type: 'in',
                    actions: [
                        {
                            type: 'adjunct',
                            target: 'box_001',
                            method: 'rotateY',
                            params: [0.5] // Rotate by 0.5 rad
                        },
                        {
                            type: 'system',
                            target: 'system',
                            method: 'log',
                            params: ['Player entered the magic zone! Box rotated.']
                        }
                    ]
                },
                {
                    type: 'out',
                    actions: [
                        {
                            type: 'system',
                            target: 'system',
                            method: 'log',
                            params: ['Player left the magic zone.']
                        }
                    ]
                }
            ]
        });
    }

    private spawnTestWall() {
        if (!this.world) return;

        this.wallEntityId = this.world.createEntity();

        this.world.addComponent<TransformComponent>(this.wallEntityId, "TransformComponent", {
            position: [0, 2, 5],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
        });

        this.world.addComponent<AdjunctComponent>(this.wallEntityId, "AdjunctComponent", {
            adjunctId: "wall_001",
            isInitialized: false,
            logicModule: BasicWallAdjunct,
            stdData: {
                type: "wall",
                params: {
                    size: [8, 0.5, 4],
                    position: [0, 0, 5],
                    rotation: [0, 0, 0]
                },
                material: { color: 0xcccccc }
            }
        });
    }

    private spawnTestWater() {
        if (!this.world) return;

        this.waterEntityId = this.world.createEntity();

        this.world.addComponent<TransformComponent>(this.waterEntityId, "TransformComponent", {
            position: [5, 2, 5],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
        });

        this.world.addComponent<AdjunctComponent>(this.waterEntityId, "AdjunctComponent", {
            adjunctId: "water_001",
            isInitialized: false,
            logicModule: BasicWaterAdjunct,
            stdData: {
                type: "water",
                params: {
                    size: [4, 4, 0.5],
                    position: [5, 0, 5],
                    rotation: [0, 0, 0]
                },
                material: { color: 0x44aaff, opacity: 0.6 }
            }
        });
    }
}
