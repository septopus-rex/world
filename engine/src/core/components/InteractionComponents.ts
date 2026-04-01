import { EntityId } from '../World';

export interface RaycastTargetComponent {
    // Defines what kind of object this is for raycast filtering
    type: "block" | "adjunct" | "entity";

    // Legacy metadata mapping
    metadata: {
        x?: number;        // Block X
        y?: number;        // Block Y
        index?: number;    // Adjunct index
        name?: string;     // Internal string identifier
    };

    // Is it currently being hovered or interacted with?
    isHovered: boolean;
    distanceToCamera: number;
}
