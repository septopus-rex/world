"use strict";
/**
 * @fileoverview
 * Base types and interfaces for the String Particle Protocol (SPP).
 * These types match the Layer 1 (Full State Definition) and Layer 2 (Collapsed State) specifications.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FaceState = exports.ParticleFace = void 0;
/**
 * Represents the 6 faces of a Particle Cell.
 */
var ParticleFace;
(function (ParticleFace) {
    ParticleFace[ParticleFace["Top"] = 0] = "Top";
    ParticleFace[ParticleFace["Bottom"] = 1] = "Bottom";
    ParticleFace[ParticleFace["Front"] = 2] = "Front";
    ParticleFace[ParticleFace["Back"] = 3] = "Back";
    ParticleFace[ParticleFace["Left"] = 4] = "Left";
    ParticleFace[ParticleFace["Right"] = 5] = "Right";
})(ParticleFace || (exports.ParticleFace = ParticleFace = {}));
/**
 * Represents the communicative state of a face.
 */
var FaceState;
(function (FaceState) {
    FaceState[FaceState["Open"] = 0] = "Open";
    FaceState[FaceState["Closed"] = 1] = "Closed";
})(FaceState || (exports.FaceState = FaceState = {}));
