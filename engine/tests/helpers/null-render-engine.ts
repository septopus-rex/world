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

  // Handle bookkeeping so module placeholder-then-swap can be asserted headlessly:
  // count group creation, child adds, and removals (the swap adds the model clone
  // then removes the placeholder; eviction removes the group).
  const counts = {
    groups: 0, added: 0, removed: 0, lastAnimState: '', soundsPlayed: [] as string[], videosAttached: [] as string[],
    lastAppearance: null as { color?: number; opacity?: number } | null,
    lastUVOffset: null as [number, number] | null,
    lastMorph: null as number[] | null,
    lastAmbient: null as number | null,
    lastSunIntensity: null as number | null,
    lastCameraPos: null as [number, number, number] | null,
    lastCameraLookAt: null as [number, number, number] | null,
  };

  return {
    // Test introspection (not part of the RenderEngine interface).
    __counts: counts,

    // THREE-typed getters (not exercised in headless ticks) — permissive dummies
    get mainCameraInstance() { return {} as any; },
    get minimapCameraInstance() { return {} as any; },
    get sceneInstance() { return {} as any; },
    get domElement() { return stubDom as any; },

    // Cameras
    setMainCameraPosition: (x: number, y: number, z: number) => { counts.lastCameraPos = [x, y, z]; },
    getMainCameraRotation: (): [number, number, number] => [0, 0, 0],
    setMainCameraRotation: () => {},
    setMainCameraLookAt: (x: number, y: number, z: number) => { counts.lastCameraLookAt = [x, y, z]; },
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
    setObjectVisible: (h: Handle, visible: boolean) => { if (h) h.visible = visible; },
    getObjectSize: (): [number, number, number] => [0, 0, 0],
    setRaycastable: () => {},

    // Scene graph
    createGroup: () => { counts.groups++; return handle(); },
    addObjectToGroup: (_group: Handle, _object: Handle) => { counts.added++; },
    setObjectUserData: (h: Handle, key: string, value: any) => { if (h && h.userData) h.userData[key] = value; },
    updateObjectAppearance: (_h: Handle, color?: number, opacity?: number) => { counts.lastAppearance = { color, opacity }; },
    setTextureOffset: (_h: Handle, u: number, v: number) => { counts.lastUVOffset = [u, v]; },
    setMorphInfluences: (_h: Handle, inf: number[]) => { counts.lastMorph = [...inf]; },
    add: () => {},
    remove: () => {},
    clearScene: () => {},

    // Lighting
    setAmbientLight: () => handle(),
    setDirectionalLight: () => handle(),
    setHemisphereLight: () => handle(),
    setFog: () => {},
    updateAmbientLight: (_h: Handle, _c: number, intensity: number) => { counts.lastAmbient = intensity; },
    updateDirectionalLight: (_h: Handle, _c: number, intensity: number) => { counts.lastSunIntensity = intensity; },

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

    // Skeletal animation (no-op in headless tests; state recorded for asserts)
    startAnimation: () => {},
    updateAnimation: () => {},
    stopAnimation: () => {},
    setAnimationState: (_h: Handle, state: string) => { counts.lastAnimState = state; },

    // Audio (recorded for asserts)
    playSpatialSound: (url: string) => { counts.soundsPlayed.push(url); },
    // A/V media adjuncts — no-op headless (real <video>/WebAudio need a browser).
    attachAudioEmitter: (_h: Handle, url: string) => { counts.soundsPlayed.push(url); },
    attachVideoScreen: (_h: Handle, url: string) => { counts.videosAttached.push(url); },

    // Misc
    getMaxAnisotropy: () => 1,
    getObjectByEntityId: () => null,
    lockControls: () => {},
    unlockControls: () => {},
    removeHandle: (h: Handle) => {
      counts.removed++;
      // Mirror RenderEngine: flag the handle so an in-flight async model swap
      // detects the group/placeholder was evicted and aborts.
      if (h && typeof h === 'object') { (h.userData ??= {}).__removed = true; }
    },
    dispose: () => {},
  };
}
