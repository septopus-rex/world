/**
 * NullRenderEngine — a headless, GPU-free stand-in for RenderEngine.
 *
 * Enabled by the renderer-injection refactor: `World` now accepts an injected
 * renderEngine (default = real WebGL RenderEngine). Tests inject this so a World
 * can boot + tick all systems in Node with no `document` / `WebGLRenderer` / `window`.
 *
 * Every method RenderEngine exposes is implemented as a deterministic no-op /
 * dummy. Returned "handles" are fresh objects (some systems key maps by identity).
 * Cast at the injection site (`as unknown as RenderEngine`) — this is a test double,
 * not a full structural implementation of the THREE-typed getters.
 */
type Handle = Record<string, any>;

export function createNullRenderEngine() {
  // RenderHandles are THREE.Object3D-like: some systems (e.g. VisualSyncSystem)
  // manipulate obj.position/rotation/scale directly. Provide a minimal mutable stub.
  const vec3 = (x = 0, y = 0, z = 0) => ({
    x, y, z,
    set(a: number, b: number, c: number) { this.x = a; this.y = b; this.z = c; },
    copy(v: any) { this.x = v.x; this.y = v.y; this.z = v.z; },
  });
  const handle = (): Handle => ({
    position: vec3(),
    rotation: vec3(),
    scale: vec3(1, 1, 1),
    quaternion: { set() {}, copy() {} },
    visible: true,
    userData: {} as any,
    children: [] as any[],
    parent: null as any,
    add() {}, remove() {}, traverse() {}, lookAt() {}, updateMatrixWorld() {},
    matrixWorld: { elements: new Array(16).fill(0) },
  });
  const stubDom = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1, right: 1, bottom: 1 }),
    style: {} as any,
    requestPointerLock: () => {},
    clientWidth: 1,
    clientHeight: 1,
  };

  return {
    // THREE-typed getters (not exercised in headless ticks) — permissive dummies
    get mainCameraInstance() { return {} as any; },
    get minimapCameraInstance() { return {} as any; },
    get sceneInstance() { return {} as any; },
    get domElement() { return stubDom as any; },

    // Cameras
    setMainCameraPosition: () => {},
    getMainCameraRotation: (): [number, number, number] => [0, 0, 0],
    setMainCameraRotation: () => {},
    updateMainCameraProjection: () => {},
    setMinimapZoom: () => {},
    setMinimapPosition: () => {},
    setMinimapLookAt: () => {},
    getMinimapPosition: (): [number, number, number] => [0, 0, 0],

    // Object transforms
    setObjectPosition: () => {},
    setObjectRotation: () => {},
    setObjectScale: () => {},
    worldToLocal: (_h: Handle, x: number, y: number, z: number): [number, number, number] => [x, y, z],
    setObjectVisible: () => {},
    getObjectSize: (): [number, number, number] => [0, 0, 0],
    setRaycastable: () => {},

    // Scene graph
    createGroup: () => handle(),
    addObjectToGroup: () => {},
    setObjectUserData: () => {},
    updateObjectAppearance: () => {},
    add: () => {},
    remove: () => {},
    clearScene: () => {},

    // Lighting
    setAmbientLight: () => handle(),
    setDirectionalLight: () => handle(),
    setHemisphereLight: () => handle(),
    updateAmbientLight: () => {},
    updateDirectionalLight: () => {},

    // Frame
    render: () => {},
    getDomElement: () => stubDom as any,
    resize: () => {},

    // Meshes / helpers
    createAvatarMesh: () => handle(),
    createMinimapMarker: () => handle(),
    createSelectionHighlight: () => handle(),
    createBlockHighlight: () => handle(),
    createGridHelper: () => handle(),
    updateBlockHighlight: () => {},

    // Raycasting / projection — queries return "nothing"
    castRayFromCamera: () => null,
    castRayFromMinimap: () => null,
    intersectRayWithPlane: (): [number, number, number] | null => null,
    worldToScreen: () => ({ x: 0, y: 0, behindCamera: false }),

    // Particles
    createWeatherParticles: () => handle(),
    updateWeatherParticles: () => {},
    createParticleBurst: () => ({ handle: handle(), velocities: new Float32Array(0) }),
    updateParticleBurst: () => {},

    // Misc
    getObjectByEntityId: () => null,
    lockControls: () => {},
    unlockControls: () => {},
    removeHandle: () => {},
    dispose: () => {},
  };
}
