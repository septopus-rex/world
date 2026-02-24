# Agent Rules

## Development Workflow
- **Git Management**: Do not proactively or automatically commit changes to git unless explicitly asked by the user.
- **Package Management**: Use `yarn` instead of `npm` for package management, unless specifically unsupported.

## Architectural Standards
- **Three.js Isolation**: Centralize all `three.js` references within the `render/` layer. Core engine systems must not import `three.js` directly. All visual elements (including helpers) must be constructed using the standard data protocol (`RenderObject`) via `MeshFactory`.
