import { useEffect, useState } from 'react';
import { useEngine } from '@core/lib/useEngine';
import { Joystick } from '@core/components/Joystick';
import { InventoryPanel } from '@core/components/InventoryPanel';
import { HealthBar } from '@core/components/HealthBar';
import { Toaster } from '@core/components/Toaster';
import { DialogueUI } from '@core/components/DialogueUI';
import { BookReader } from '@core/components/BookReader';
import { BoardPanel } from '@core/components/BoardPanel';
import { LeaveGameDialog } from '@core/components/LeaveGameDialog';
import { mapPage } from '@core/components/WorldMap2D';
import { PageHost, PageProvider, usePages } from '@core/components/page';
import { AvatarPicker } from '@core/components/AvatarPicker';
import { ParkourHUD } from '@core/components/ParkourHUD';
import { ShootingHUD } from '@core/components/ShootingHUD';
import { MahjongHUD } from '@core/components/MahjongHUD';
import { MahjongTableHUD } from '@core/components/MahjongTableHUD';
import { PoolHUD } from '@core/components/PoolHUD';
import { StatusPanel } from '@core/components/StatusPanel';
import { MiniCompass } from '@core/components/MiniCompass';
import { BlockInspector } from '@core/components/BlockInspector';

/**
 * CornerBadge — one of the three notched corners framing the joystick.
 *
 * The shape: straight on its two OUTER edges, a quarter-circle bitten out of the
 * inner one — what a square corner looks like when a round stick is pressed into
 * it. Three of them read as a frame around the stick rather than as three more
 * buttons floating near it, which is the point: these are occasional controls,
 * and on a phone every permanent circle costs a piece of the world view.
 *
 * Geometry, all of it load-bearing (JOY_* below are the joystick's own numbers):
 *   · offset OFFSET px diagonally OUT from the stick's box corner, so a badge
 *     stands off the stick instead of touching it;
 *   · the arc is CONCENTRIC with the stick — centre at the stick's centre in
 *     local coords, radius R + the RADIAL length of that diagonal offset. Both
 *     halves matter: a radius of the badge's own size (44 was tried) makes the
 *     two curves cross instead of nest, and keeping R while moving the box
 *     leaves a gap that is 7 px in the middle and 0 at the ends — two
 *     nearly-coincident arcs, which reads as a mistake rather than a design;
 *   · the top-left path is drawn once and MIRRORED for the other two corners, so
 *     the three can never drift apart. The glyph is re-mirrored back to upright;
 *   · the button BOX overlaps the stick's ring, but only the drawn path takes
 *     pointer events. Without that, these corners would silently eat the edges
 *     of the stick's drag area — they are the layer above. It is also why e2e
 *     taps them by position: a badge's own centre is inside the bite, i.e.
 *     deliberately not a target.
 * Active state is COLOUR only. Rotating a badge to signal "open" was tried and is
 * wrong twice over: it destroys the one thing the shape says (which corner it
 * is), and it carries the drawn area — the only tappable part — to the opposite
 * side, so the next tap lands in the bite and does nothing.
 */
const JOY_SIZE = 130, JOY_LEFT = 24, JOY_BOTTOM = 36;   // must match the <Joystick> below
const BADGE = 44, BADGE_OFFSET = 5;
/** Radial distance of a diagonal offset — what the arc has to grow by. */
const BADGE_R = JOY_SIZE / 2 + Math.round(BADGE_OFFSET * Math.SQRT2);
/** The stick's centre in badge-local coords (its top-left is the stick box's,
 *  displaced by the offset). */
const BADGE_CX = JOY_SIZE / 2 + BADGE_OFFSET;
/** Where that circle leaves the badge box. Derived, not measured: change BADGE
 *  or the offset and the arc still lands on the corners instead of drifting off
 *  them by a few pixels nobody notices until the shape looks subtly wrong. */
const STUB = +(BADGE_CX - Math.sqrt(BADGE_R ** 2 - (BADGE_CX - BADGE) ** 2)).toFixed(2);
const INSET = 1.5;   // half the stroke, so the drawn edge sits inside the box
const BADGE_PATH = `M ${INSET} ${BADGE - INSET} L ${INSET} ${INSET} L ${BADGE - INSET} ${INSET}`
    + ` L ${BADGE - INSET} ${STUB} A ${BADGE_R} ${BADGE_R} 0 0 0 ${STUB} ${BADGE - INSET} Z`;

const BADGE_POS = {
    'top-left': { left: JOY_LEFT - BADGE_OFFSET, bottom: JOY_BOTTOM + JOY_SIZE + BADGE_OFFSET - BADGE },
    'top-right': { left: JOY_LEFT + JOY_SIZE + BADGE_OFFSET - BADGE, bottom: JOY_BOTTOM + JOY_SIZE + BADGE_OFFSET - BADGE },
    'bottom-right': { left: JOY_LEFT + JOY_SIZE + BADGE_OFFSET - BADGE, bottom: JOY_BOTTOM - BADGE_OFFSET },
} as const;
/** Mirror that turns the authored top-left shape into each corner. */
const BADGE_FLIP = { 'top-left': '', 'top-right': '-scale-x-100', 'bottom-right': 'rotate-180' } as const;
/** Badges carry NO glyph: the notch's solid part is a triangle ~24 px on the
 *  diagonal, so a 15 px emoji filled it edge to edge and still read as a coloured
 *  smudge. Position identifies them instead — and they all share ONE tone, the
 *  same glass as the action keys. They used to be flat cyan outlines, which made
 *  the two thumbs look like two different products; the shell has one material. */
const BADGE_DIM = { fill: 'rgba(255,255,255,0.07)', stroke: 'rgba(255,255,255,0.26)' };

function CornerBadge({ corner, testId, label, active, dimmed, expanded, onClick }: {
    corner: keyof typeof BADGE_POS;
    testId: string;
    label: string;
    active: boolean;
    /** Steering: every badge greys out so nothing competes with the stick. */
    dimmed: boolean;
    expanded?: boolean;
    onClick: () => void;
}) {
    const pos = BADGE_POS[corner];
    // Dimming OUTRANKS active: while you are steering, an open panel's badge must
    // recede too, or the "everything stepped back" reading breaks on exactly the
    // badge you last touched.
    const gid = `badge-glass-${corner}`;
    // Badges read as EDGES, not as filled keys: a bright stroke over a faint
    // wash. They sit on the plate, and the same glass fill as an action key made
    // them vanish into it — dark on dark, only the hairline showing.
    const tone = dimmed ? BADGE_DIM : {
        fill: `url(#${gid})`,
        stroke: active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.52)',
    };
    return (
        <div className="absolute z-20 pointer-events-none" style={{ left: pos.left, bottom: pos.bottom }}>
            <button data-testid={testId} aria-label={label} aria-pressed={expanded === undefined ? active : undefined}
                aria-expanded={expanded}
                onClick={onClick}
                style={{ width: BADGE, height: BADGE }}
                className="block pointer-events-none active:scale-95">
                <svg viewBox={`0 0 ${BADGE} ${BADGE}`} width={BADGE} height={BADGE}
                    className={`pointer-events-none ${BADGE_FLIP[corner]}`}
                    style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.45))' }}>
                    {/* The same top-lit glass the action keys use, expressed as an
                        SVG gradient because a path cannot take a CSS background.
                        Per-corner id: three identical gradients would work (the
                        browser resolves duplicate ids to the first), but a
                        collision is a bug waiting for the day they differ. */}
                    <defs>
                        <radialGradient id={gid} cx="50%" cy="0%" r="125%">
                            <stop offset="0%" stopColor={active ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.20)'} />
                            <stop offset="55%" stopColor={active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)'} />
                            <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
                        </radialGradient>
                    </defs>
                    <path d={BADGE_PATH}
                        className="pointer-events-auto transition-colors duration-200"
                        fill={tone.fill} stroke={tone.stroke}
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
        </div>
    );
}

/**
 * PadButton — one slot of the right-hand action cross.
 *
 * The cross is laid out from its own box: PAD_SPAN square, each button PAD_BTN
 * across, centred on the edge midpoints. Expressing it as four absolute slots in
 * one box (rather than four independently placed buttons) is what keeps it a
 * cross — the arms cannot drift apart when one button's size is tweaked, and an
 * empty slot leaves a hole in the shape rather than collapsing the others into
 * a different arrangement.
 */
// Sized to MATCH THE LEFT SIDE, not to fit its own contents: the stick plus its
// three badges occupies a 140 px square, so a 180 px cross (the first attempt)
// read as the bigger, more important half of a screen whose actual subject is
// the world. 48 px buttons on a 4 px gap put the cross at 152 — near enough that
// the two thumbs get visually equal territory.
const PAD_BTN = 48;
const PAD_GAP = 4;                              // between opposite buttons' facing edges
const PAD_SPAN = PAD_BTN * 3 + PAD_GAP * 2;     // 152 — outer box of the cross
// Clear of the screen edges. Not decoration: at 14/26 the right arm sat ~4 mm
// from the bezel and the bottom arm inside the iOS home-indicator strip, where
// a swipe-up is as likely as a tap.
const PAD_RIGHT = 20, PAD_BOTTOM = 34;

/**
 * PLATE_PAD — the margin every plate keeps around what sits on it. BOTH sides use
 * it, and that is the point: the stick's plate and the cross's plate are the same
 * idea at two scales, so the two thumbs read as one design rather than as a
 * joystick that happens to have buttons near it.
 *
 * Its size is not slack either. At 0 (the first cut) the keys touched the plate's
 * edge and the whole thing looked like a sticker sheet, not a moulded pad.
 */
const PLATE_PAD = 11;
const PLATE_FILL = 'rgba(8,14,22,0.30)';
const PLATE_STROKE = 'rgba(255,255,255,0.14)';
const PLATE_SHADOW = '0 10px 26px rgba(0,0,0,0.34)';
const PLATE_SPAN = PAD_SPAN + PLATE_PAD * 2;

/**
 * The cross-shaped plate the four buttons sit on. Four unconnected circles read
 * as four loose things dropped near each other; one plate under them reads as a
 * control. Drawn as ONE path (not two crossed rects) so the inside of the cross
 * has no seam where two borders would overlap — the concave corners are part of
 * the outline, which is what makes it look moulded rather than assembled.
 */
const PAD_PLATE = (() => {
    const S = PLATE_SPAN, a = (S - (PAD_BTN + PLATE_PAD * 2)) / 2, b = S - a; // arm edges
    const ro = 20, ri = 12;                                                   // outer / inner radii
    return [
        `M ${a + ro} 0`, `L ${b - ro} 0`, `A ${ro} ${ro} 0 0 1 ${b} ${ro}`,
        `L ${b} ${a - ri}`, `A ${ri} ${ri} 0 0 0 ${b + ri} ${a}`,
        `L ${S - ro} ${a}`, `A ${ro} ${ro} 0 0 1 ${S} ${a + ro}`,
        `L ${S} ${b - ro}`, `A ${ro} ${ro} 0 0 1 ${S - ro} ${b}`,
        `L ${b + ri} ${b}`, `A ${ri} ${ri} 0 0 0 ${b} ${b + ri}`,
        `L ${b} ${S - ro}`, `A ${ro} ${ro} 0 0 1 ${b - ro} ${S}`,
        `L ${a + ro} ${S}`, `A ${ro} ${ro} 0 0 1 ${a} ${S - ro}`,
        `L ${a} ${b + ri}`, `A ${ri} ${ri} 0 0 0 ${a - ri} ${b}`,
        `L ${ro} ${b}`, `A ${ro} ${ro} 0 0 1 0 ${b - ro}`,
        `L 0 ${a + ro}`, `A ${ro} ${ro} 0 0 1 ${ro} ${a}`,
        `L ${a - ri} ${a}`, `A ${ri} ${ri} 0 0 0 ${a} ${a - ri}`,
        `L ${a} ${ro}`, `A ${ro} ${ro} 0 0 1 ${a + ro} 0`, 'Z',
    ].join(' ');
})();

/**
 * Shared glass material for every control on this layer. A flat translucent fill
 * with a hairline border is what "simple" looks like at rest and what "cheap"
 * looks like over a bright world — over grass the buttons were washed-out discs.
 * Three cheap things fix that and are used on the stick, the pad plate and every
 * button, so the layer reads as one material:
 *   · a top-lit radial fill (light gathers where a light would gather),
 *   · an inset hairline along the top edge and a darker one along the bottom —
 *     the two-pixel trick that makes a disc look domed instead of printed,
 *   · a real drop shadow, so the layer floats above the world instead of being
 *     stuck to it.
 */
const GLASS_FILL = 'radial-gradient(125% 125% at 50% 0%, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.07) 42%, rgba(8,14,22,0.34) 100%)';
const GLASS_EDGE = 'inset 0 1px 0 rgba(255,255,255,0.34), inset 0 -1px 0 rgba(0,0,0,0.30), 0 6px 18px rgba(0,0,0,0.38)';
const GLASS_ON_FILL = 'radial-gradient(125% 125% at 50% 0%, rgba(255,231,168,0.42) 0%, rgba(251,191,36,0.24) 45%, rgba(120,72,10,0.30) 100%)';

/**
 * Line icons for the action keys, one stroke weight, no fills, no emoji.
 *
 * Emoji were tried and are wrong here for reasons that outlive taste: they are
 * full-colour art from a different design system (they ignore the shell's
 * palette entirely), they render differently per platform, and at 20 px the
 * detailed ones — 🔦 especially — collapse into a smudge. Word labels (EDIT /
 * 3RD / JUMP) survived longer but need a language and cannot show state.
 *
 * A single-weight outline in currentColor inherits the button's colour, which is
 * what makes the lit torch key legible: the glyph turns amber with its key.
 */
const ICON = {
    /** Create — a plus: the entry that OPENS the creation menu (block edit now,
     *  more tools later). Not a pencil: the pencil means "edit this block" and
     *  now lives on the menu item itself. */
    create: 'M12 5v14 M5 12h14',
    edit: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z M14.5 6.5l3 3',
    /** Third person: a figure seen from outside. */
    third: 'M12 8.2a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4z M5.6 20.5a6.4 6.4 0 0 1 12.8 0',
    /** First person: an eye. */
    first: 'M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z M14.6 12a2.6 2.6 0 1 1-5.2 0 2.6 2.6 0 0 1 5.2 0z',
    torch: 'M8.5 9.5h7v9.2a1.8 1.8 0 0 1-1.8 1.8h-3.4a1.8 1.8 0 0 1-1.8-1.8V9.5z M7.4 3.4h9.2l-1.1 6.1H8.5L7.4 3.4z M12 13v2.4',
    jump: 'M12 20V5 M5.5 11.5 12 5l6.5 6.5',
} as const;

function LineIcon({ d }: { d: string }) {
    return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden
            style={{ filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.55))' }}>
            {d.split(' M').map((seg, i) => <path key={i} d={i === 0 ? seg : `M${seg}`} />)}
        </svg>
    );
}
const PAD_SLOT = {
    top: { left: (PAD_SPAN - PAD_BTN) / 2, top: 0 },
    bottom: { left: (PAD_SPAN - PAD_BTN) / 2, top: PAD_SPAN - PAD_BTN },
    left: { left: 0, top: (PAD_SPAN - PAD_BTN) / 2 },
    right: { left: PAD_SPAN - PAD_BTN, top: (PAD_SPAN - PAD_BTN) / 2 },
} as const;

function PadButton({ slot, testId, label, children, onClick, onPointerDown, active, pressed, expanded, primary }: {
    slot: keyof typeof PAD_SLOT;
    testId: string;
    label: string;
    children: React.ReactNode;
    onClick?: () => void;
    onPointerDown?: (e: React.PointerEvent) => void;
    /** Lit (torch on / menu open). */
    active?: boolean;
    /** Reported as aria-pressed — only for real toggles. */
    pressed?: boolean;
    /** Reported as aria-expanded — only for keys that open a menu. */
    expanded?: boolean;
    /** The one you press most; slightly stronger border. */
    primary?: boolean;
}) {
    const pos = PAD_SLOT[slot];
    return (
        <button data-testid={testId} aria-label={label} aria-pressed={pressed} aria-expanded={expanded}
            onClick={onClick} onPointerDown={onPointerDown}
            style={{
                left: pos.left, top: pos.top, width: PAD_BTN, height: PAD_BTN,
                background: active ? GLASS_ON_FILL : GLASS_FILL,
                boxShadow: GLASS_EDGE,
                borderColor: active ? 'rgba(253,224,150,0.75)' : `rgba(255,255,255,${primary ? 0.42 : 0.28})`,
            }}
            className={`absolute pointer-events-auto rounded-full border backdrop-blur-md flex items-center
                justify-center active:scale-95 transition-[background,border-color,transform,color] duration-150 ${
                active ? 'text-amber-100' : 'text-white/90'}`}>
            {children}
        </button>
    );
}

/**
 * MobileApp — the MOBILE shell (specs/mobile-client.md M1+M3). Same shared core
 * as the desktop shell (useEngine → DesktopLoader → the pure-data world); only
 * the chrome and input affordances differ:
 *
 *   · left virtual joystick → loader.setPlayerMoveIntent (camera-relative, the
 *     same channel the e2e drives)
 *   · drag on the canvas    → engine-native touch look (InputProvider → CameraRig)
 *   · tap                   → browser-synthesized click → the raycast interact path
 *   · three CornerBadges framing the joystick = things you OPEN — map (top-left),
 *     bag (top-right), avatar (bottom-right); they grey out while steering
 *   · right-hand action cross = things you DO — 创作 menu (top; block edit today,
 *     every future creation tool joins it), camera view (left), torch (right),
 *     JUMP (bottom, loader.triggerPlayerJump)
 *
 * Interaction surface (dialogue / book / HP / toasts / game HUDs / leave dialog)
 * is the SAME shared component set the desktop uses — shells only compose.
 */
function MobileApp() {
    const { loader, ready, mode, setMode, gameZoneActive, leaveIntent, activeGame, gameState, view, setView } = useEngine('three_demo');
    const pages = usePages();
    const [sheet, setSheet] = useState<'bag' | 'avatar' | null>(null);
    const [inspecting, setInspecting] = useState(false);
    /** Hand torch — mirrors the engine's own state (loader.toggleFlashlight
     *  returns it), so the button never claims a state the renderer doesn't have. */
    const [torchOn, setTorchOn] = useState(false);
    /** True while the joystick is being dragged — greys the corner badges out. */
    const [steering, setSteering] = useState(false);
    // 创作 menu (pad top slot). One item today — block edit — but it is the
    // designated single entry every future creation tool joins (SPP sandbox if
    // it ever gets touch-ready, AI authoring, …), instead of hunting for a free
    // slot on a cross whose shape says "exactly four".
    const [createOpen, setCreateOpen] = useState(false);
    useEffect(() => { setCreateOpen(false); }, [mode]);
    // Edit-bar palette gate: the engine's full palette (20+ type buttons)
    // floods a phone screen, so it stays hidden (CSS in index.css keyed off
    // .m-palette-open on the app root) until the bar's 添加 toggle opens it.
    const [paletteOpen, setPaletteOpen] = useState(false);
    useEffect(() => { if (mode !== 'edit') setPaletteOpen(false); }, [mode]);
    // Auto-collapse once a type is picked: the engine's palette buttons stop
    // propagation on bubble, but a CAPTURE-phase listener on the engine host
    // still sees the tap first. Picking (or un-picking) a type is exactly the
    // moment the creator needs the world back to tap a surface.
    useEffect(() => {
        if (!paletteOpen) return;
        const host = document.getElementById('three_demo');
        if (!host) return;
        const collapse = (e: Event) => {
            if ((e.target as HTMLElement).closest?.('.sept-ui-group.mid-left')) setPaletteOpen(false);
        };
        host.addEventListener('click', collapse, true);
        return () => host.removeEventListener('click', collapse, true);
    }, [paletteOpen]);

    // Fade out the boot splash once the world is ready (same as the desktop shell).
    useEffect(() => {
        if (!ready) return;
        const el = document.getElementById('init-loader');
        if (el) {
            el.classList.add('fade-out');
            setTimeout(() => el.remove(), 700);
        }
    }, [ready]);

    return (
        <div data-testid="mobile-app" className={`relative w-screen h-screen overflow-hidden bg-black text-white select-none${paletteOpen ? ' m-palette-open' : ''}`}>
            {/* The engine canvas host — drag = look (engine-native touch), tap = interact. */}
            <div id="three_demo" className="absolute inset-0 z-0 w-full h-full"></div>

            {/* ── top-left: collapsible status (mode + version, collapsed by default);
                   top-right: mini compass + block coord / world id ── */}
            {ready && <StatusPanel loader={loader} version={__APP_VERSION__} onInspect={() => setInspecting(true)} />}
            {ready && <MiniCompass loader={loader} onOpenMap={() => pages.push(mapPage(loader))} />}
            {ready && <BlockInspector loader={loader} open={inspecting} onClose={() => setInspecting(false)} />}

            {/* ── shared interaction surface (identical components to desktop) ── */}
            {ready && <HealthBar loader={loader} />}
            {ready && <DialogueUI loader={loader} />}
            {ready && <BookReader loader={loader} />}
            {ready && <BoardPanel loader={loader} />}
            {ready && <Toaster loader={loader} />}
            <ParkourHUD loader={loader} ready={ready} />
            <ShootingHUD loader={loader} ready={ready} />
            {ready && loader && activeGame === 'mahjong' && gameState && <MahjongHUD state={gameState} loader={loader} />}
            {ready && loader && activeGame === 'pool' && gameState && <PoolHUD state={gameState} loader={loader} />}

            {/* The native 3D mahjong table (Pattern B) has no `activeGame`; its HUD
                polls the engine and renders nothing unless a table is live. */}
            {ready && loader && mode === 'game' && !activeGame && <MahjongTableHUD loader={loader} />}
            <LeaveGameDialog loader={loader} open={ready && leaveIntent} />

            {/* ── zone-gated game entry / exit (same contract as desktop) ── */}
            {ready && gameZoneActive && mode !== 'game' && (
                <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
                    <button data-testid="enter-game" onClick={() => setMode('game')}
                        className="px-5 py-2.5 rounded-2xl text-sm font-black tracking-widest uppercase text-green-200 bg-green-500/25 border border-green-400/60 active:scale-95 shadow-2xl">
                        ▶ 进入游戏
                    </button>
                </div>
            )}
            {ready && mode === 'game' && !activeGame && (
                <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
                    <button data-testid="exit-game" onClick={() => setMode('normal')}
                        className="px-4 py-2 rounded-2xl text-xs font-black tracking-widest uppercase text-red-200 bg-red-500/20 border border-red-400/50 active:scale-95 shadow-2xl">
                        ■ 退出游戏
                    </button>
                </div>
            )}

            {/* (Edit entry lives in the 创作 menu opened from the action pad's
                top slot — see below. The block you STAND ON is the edit target:
                the engine locks it on entry (EditSessionManager) and the session
                survives walking into neighbouring blocks to inspect the build.
                Gated through loader.canEditBlock() — the ownership seam, always
                true until ownership lands.) */}

            {/* ── edit bar: the ONE home for edit functions on this shell (they
                   accumulate here as editing grows — the engine's own DOM UI
                   stays collapsed so entering Edit doesn't flood the screen).
                   退出编辑 = setMode('normal'), which persists the block draft;
                   添加 toggles the engine palette (auto-collapses on pick). ── */}
            {ready && mode === 'edit' && (
                <div data-testid="m-edit-bar" className="absolute bottom-44 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
                    <div className="flex items-center gap-2 px-2 py-2 rounded-2xl bg-black/55 border border-yellow-400/40 backdrop-blur-md shadow-2xl">
                        <button data-testid="m-edit-exit" aria-label="退出编辑"
                            onClick={() => setMode('normal')}
                            className="px-3.5 py-2 rounded-xl text-xs font-black tracking-wider text-yellow-200 bg-yellow-500/20 border border-yellow-400/50 active:scale-95">
                            ✓ 退出编辑
                        </button>
                        <button data-testid="m-edit-add" aria-label="添加 adjunct"
                            onClick={() => setPaletteOpen(o => !o)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black tracking-wider border active:scale-95 ${paletteOpen ? 'text-cyan-100 bg-cyan-500/25 border-cyan-400/60' : 'text-white/90 bg-white/10 border-white/25'}`}>
                            ＋ 添加
                        </button>
                    </div>
                </div>
            )}

            {/* ── the three corners around the joystick ─────────────────────────
                Each is the shape a square corner takes when a round stick is
                pressed into it; together they frame the stick instead of floating
                beside it. See CornerBadge for the geometry and for why only the
                drawn path is tappable.

                The split with the right-hand pad is the organising idea of this
                shell: LEFT = things you OPEN (map / bag / avatar — screens you
                stop to look at), RIGHT = things you DO (edit / view / torch /
                jump — pressed mid-motion). That is also why the badges grey out
                while steering and the pad does not: you jump while walking, you
                do not open your bag while walking. ── */}
            {ready && (
                <>
                    {/* The stick's plate — same material and same PLATE_PAD margin
                        as the cross's, so both thumbs get one design instead of a
                        joystick that happens to have buttons near it. Sized off the
                        BADGE box (the badges are the outermost thing on this side),
                        and purely visual: taps land on the stick and the badges. */}
                    {/* Radius 20, echoing the cross plate's outer corners — and the
                        badges' own right angles, which a 34 px round-over left
                        floating inside a curve that was going the other way. */}
                    <div aria-hidden className="absolute z-10 pointer-events-none rounded-[20px]"
                        style={{
                            left: BADGE_POS['top-left'].left - PLATE_PAD,
                            bottom: BADGE_POS['bottom-right'].bottom - PLATE_PAD,
                            width: JOY_SIZE + 2 * BADGE_OFFSET + 2 * PLATE_PAD,
                            height: JOY_SIZE + 2 * BADGE_OFFSET + 2 * PLATE_PAD,
                            background: PLATE_FILL, border: `1px solid ${PLATE_STROKE}`,
                            boxShadow: PLATE_SHADOW, backdropFilter: 'blur(6px)',
                        }} />
                    <CornerBadge corner="top-left" testId="m-map-toggle" active={false}
                        dimmed={steering} label="世界地图"
                        onClick={() => pages.push(mapPage(loader))} />
                    <CornerBadge corner="top-right" testId="m-bag-toggle" active={sheet === 'bag'}
                        dimmed={steering} label="背包"
                        onClick={() => setSheet(s => (s === 'bag' ? null : 'bag'))} />
                    <CornerBadge corner="bottom-right" testId="m-avatar-toggle" active={sheet === 'avatar'}
                        dimmed={steering} label="更换化身"
                        onClick={() => setSheet(s => (s === 'avatar' ? null : 'avatar'))} />
                </>
            )}

            {/* The row the corner opens, stacked directly ABOVE it and sharing its
                left edge. */}

            {/* ── movement: virtual joystick (left thumb) ───────────────────────
                Positioned from the same JOY_* constants the corner badges derive
                from — the badges are cut to fit THIS circle, so a hardcoded class
                here would silently break their arcs. */}
            <div data-testid="m-joystick" className="absolute z-20 pointer-events-none"
                style={{ left: JOY_LEFT, bottom: JOY_BOTTOM }}>
                {/* `steering` greys the corner badges while the stick is in use —
                    they frame it, so they must not compete with it mid-move. Set
                    on every onMove and cleared on onStop; React skips the
                    re-render when the value is unchanged, so the per-frame
                    setState during a drag costs nothing. */}
                <Joystick size={JOY_SIZE}
                    onMove={(d) => { loader?.setPlayerMoveIntent(d.x, d.y); setSteering(true); }}
                    onStop={() => { loader?.setPlayerMoveIntent(0, 0); setSteering(false); }} />
            </div>

            {/* ── action pad: the four verbs, in a cross under the right thumb ──
                A cross rather than the old column, because a thumb pivots — the
                four positions around its arc are all equally reachable without
                moving the hand, and the shape itself tells you there are exactly
                four. JUMP takes the BOTTOM slot: it is the one pressed hardest
                and most often, and that is where the thumb rests.

                These do NOT grey out while steering (the corner badges do): you
                jump while walking. That asymmetry is the left/right split — open
                vs do — made visible.

                The top slot is empty in Edit mode: the edit bar takes over there
                and owns its own exit, so a second "leave editing" affordance in
                the pad would be two ways to do the same thing, one of them
                hidden behind a mode. */}
            {ready && (
                <div className="absolute z-20 pointer-events-none"
                    style={{ right: PAD_RIGHT, bottom: PAD_BOTTOM, width: PAD_SPAN, height: PAD_SPAN }}>
                    {/* The plate, inset by −PLATE_PAD so it extends past the keys by
                        that margin on every side (the keys used to sit flush on its
                        edge, which read as stickers on a sheet). Purely visual:
                        pointer-events off, so taps between the arms belong to the
                        world. */}
                    <svg viewBox={`0 0 ${PLATE_SPAN} ${PLATE_SPAN}`} width={PLATE_SPAN} height={PLATE_SPAN}
                        className="absolute pointer-events-none" aria-hidden
                        style={{ left: -PLATE_PAD, top: -PLATE_PAD, filter: `drop-shadow(${PLATE_SHADOW})` }}>
                        <path d={PAD_PLATE} fill={PLATE_FILL} stroke={PLATE_STROKE} strokeWidth="1" />
                    </svg>
                    {/* 创作 — not an action itself but the door to all of them:
                        tapping it opens the creation menu above the pad. Amber
                        while open, same "this is ON" glass the torch uses. */}
                    {mode !== 'game' && mode !== 'edit' && loader?.canEditBlock() && (
                        <PadButton slot="top" testId="m-create-toggle" label="创作"
                            active={createOpen} expanded={createOpen}
                            onClick={() => setCreateOpen(o => !o)}><LineIcon d={ICON.create} /></PadButton>
                    )}
                    <PadButton slot="left" testId="m-view-toggle"
                        label={view === 'third' ? '第三人称视角' : '第一人称视角'}
                        onClick={() => setView(view === 'third' ? 'first' : 'third')}>
                        <LineIcon d={view === 'third' ? ICON.third : ICON.first} />
                    </PadButton>
                    {/* Hand torch. The engine owns the state (loader.flashlightOn());
                        this is only a mirror, so an engine-side change can't desync it. */}
                    <PadButton slot="right" testId="m-flashlight" active={torchOn}
                        label={torchOn ? '关闭手电筒' : '打开手电筒'} pressed={torchOn}
                        onClick={() => setTorchOn(!!loader?.toggleFlashlight())}>
                        <LineIcon d={ICON.torch} />
                    </PadButton>
                    {/* onPointerDown, not onClick: jump should fire on touch-down,
                        not on release — a platformer that waits for your thumb to
                        lift feels broken. */}
                    <PadButton slot="bottom" testId="m-jump" label="跳跃" primary
                        onPointerDown={(e) => { e.preventDefault(); loader?.triggerPlayerJump(); }}>
                        <LineIcon d={ICON.jump} />
                    </PadButton>
                </div>
            )}

            {/* ── 创作 menu: what the pad's top key opens. Stacked right above the
                   pad and sharing the plate's right edge, so the menu visibly
                   belongs to the key that summoned it. Items reuse the pad's line
                   icons (menu buttons carry text, so the icon is a prefix, not
                   the whole label). Selecting an item changes mode, and the
                   mode-change effect closes the menu — no manual bookkeeping. ── */}
            {ready && createOpen && mode !== 'game' && mode !== 'edit' && (
                <div data-testid="m-create-menu" className="absolute z-30 pointer-events-auto"
                    style={{ right: PAD_RIGHT - PLATE_PAD, bottom: PAD_BOTTOM + PAD_SPAN + PLATE_PAD + 10 }}>
                    <div className="flex flex-col gap-1.5 px-2 py-2 rounded-2xl bg-black/55 border border-white/20 backdrop-blur-md shadow-2xl">
                        <button data-testid="m-create-edit" aria-label="编辑此块"
                            onClick={() => setMode('edit')}
                            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-black tracking-wider text-white/90 bg-white/10 border border-white/25 active:scale-95">
                            <LineIcon d={ICON.edit} /> 编辑此块
                        </button>
                    </div>
                </div>
            )}

            {/* Bag / avatar panels — opened by the top-right and bottom-right
                corner badges. Bag sheet is a visible container even when empty
                (the shared InventoryPanel renders null on an empty bag). */}
            {ready && sheet === 'bag' && (
                <div data-testid="m-bag-sheet" className="absolute bottom-16 left-3 z-30 pointer-events-none">
                    <div className="px-2.5 py-1 rounded-lg bg-black/50 border border-cyan-500/30 text-[10px] font-black tracking-widest uppercase text-cyan-300/80">
                        🎒 背包 · Bag
                    </div>
                    <InventoryPanel loader={loader} />
                </div>
            )}
            {sheet === 'avatar' && <AvatarPicker loader={loader} ready={ready} />}

            {/* The 2D page stack (map → block detail → …). On this narrow shell
                the surface resolves to a bottom sheet; the desktop gets a centred
                card from the SAME page definitions. */}
            <PageHost />
        </div>
    );
}

/** Provider wraps the shell so any panel can `usePages()`; it renders no DOM. */
export default function MobileAppRoot() {
    return (
        <PageProvider>
            <MobileApp />
        </PageProvider>
    );
}
