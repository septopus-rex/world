# Septopus UI Service Protocol (v1.0)

This protocol defines the standardized communication layer between the Septopus Engine and the User Interface provider. It ensures that the engine remains UI-agnostic while allowing host applications (React, Vue, Mobile Native) to implement high-quality, contextual interfaces.

## 1. Core Interface: `IUIProvider`

Any UI provider must implement the following methods to be compatible with the engine.

### `showGroup(id, items, position)`
Standard method for displaying a cluster of interactive elements (buttons).
- **id**: Unique identifier for the group (e.g., `"edit-controls"`).
- **items**: Array of `UIButtonConfig`.
- **position**: 
    - `String`: One of `top-left`, `top-right`, `bottom-left`, `bottom-right`.
    - `Object`: `{ x: number, y: number }` (Normalized screen coordinates 0.0 to 1.0).

### `showButton(id, config, position?)`
Displays a single action button.
- **position**: Optional absolute coordinate object.

### `showModal(id, config)`
Displays a focused dialog box.
- **config**: `UIModalConfig` containing title, body, and action buttons.

### `showToast(message, duration?)`
Displays a non-blocking notification message.

### `updateCompass(yaw)`
Updates the rotation of the compass widget.
- **yaw**: Angle in radians.

### `updateWidget(id, data)`
Generic method for updating complex state-driven widgets (e.g., Minimap, Health, Stats).
- **id**: Unique identifier for the widget.
- **data**: Component-specific data object.

### `hide(id)`
Removes or closes a UI element/group by its unique ID.

---

## 2. Data Structures

### `UIButtonConfig`
```typescript
interface UIButtonConfig {
    label: string;       // Text display
    icon?: string;        // Icon identifier (Emoji or SVG string)
    onClick: () => void; // Engine callback
    active?: boolean;    // Highlight state
    disabled?: boolean;  // Interaction lock
    tooltip?: string;    // Hover explanation
    variant?: 'primary' | 'secondary' | 'danger'; // Thematic style
}
```

### `UIModalConfig`
```typescript
interface UIModalConfig {
    title: string;
    body: string;       // Supports simple HTML or Markdown
    buttons: UIButtonConfig[];
    onClose?: () => void;
}
```

---

## 3. UI Lifecycle & Rules: "Logic vs. Presentation"

To ensure full flexibility, the protocol strictly separates the "Brain" (Engine) from the "Body" (UI):

1. **Engine Authority (Logic)**: 
    - The Engine determines **what** interactions are available and **when** they should appear (e.g., selection triggers Edit Controls).
    - The Engine provides the `onClick` closures that contain the actual state-changing logic.

2. **Provider Authority (Presentation)**:
    - **Layout & Style**: The UI Provider determines the visual theme, animations, and container styles.
    - **Delegated Positioning**: While the Engine suggests a position via `{x, y}` coordinates (based on 3D projections), the UI Provider has the final say. It can:
        - *Follow strictly*: Place UI directly at the coordinate (Contextual UI).
        - *Offset/Anchor*: Use the coordinate as an anchor point but adjust for screen boundaries.
        - *Ignore & Dock*: Disregard the coordinate and dock the group to a fixed corner (Fixed UI).

3. **Event Blocking**: UI providers MUST implement `e.stopPropagation()` on all input events (`mousedown`, `click`, etc.) to prevent interactions with the 3D world behind the UI.

4. **Implementation Fallback**: The engine provides a `DefaultUIProvider` using Vanilla JS/CSS. Host applications should override this via `engine.setUIProvider()` to provide an integrated experience (e.g., using React components).
