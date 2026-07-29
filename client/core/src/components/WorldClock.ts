/**
 * WorldClock — formatting for the in-world clock readout, shared by both shells'
 * HUDs (desktop Compass centre, mobile MiniCompass block). Pure functions, no
 * React: the two shells write it into the DOM differently (desktop mutates
 * textContent from its existing rAF, mobile holds it in state), and the thing
 * worth sharing is what it SAYS, not how it gets there.
 */

/** What Engine.environmentInfo() returns (the fields the HUD reads). */
export interface WorldClockSource {
    hour: number;
    minute: number;
    weather: string;
    weatherGrade: number;
    dayFactor: number;
}

/** 24-hour `HH:MM`. Seconds are deliberately absent — the default day is 10 real
 *  minutes long, so the seconds digit is a blur and reads as a stopwatch. */
export function formatWorldTime(e: { hour: number; minute: number }): string {
    const p = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');
    return `${p(e.hour)}:${p(e.minute)}`;
}

/**
 * One character for the weather, plus the grade when it is heavy enough to be
 * worth saying. Chinese single characters rather than emoji: the HUD is 8–11 px
 * type, where emoji are a different design system's colour art and turn to mush
 * (the same call the mobile control layer made).
 */
const WEATHER_GLYPH: Record<string, string> = {
    clear: '晴',
    cloud: '阴',
    rain: '雨',
    snow: '雪',
};

export function formatWeather(e: { weather: string; weatherGrade: number }): string {
    const g = WEATHER_GLYPH[e.weather] ?? '晴';
    return e.weatherGrade >= 2 && e.weather !== 'clear' ? `${g}${e.weatherGrade}` : g;
}

/**
 * The line the HUD shows: `08:42 晴`.
 *
 * Time and weather ride together because either one ALONE misexplains a dark
 * screen — "it is dark" is 21:00 in fair weather and it is also noon under a
 * grade-3 downpour, and the fix a player reaches for is different in each case.
 * This readout exists because of a bug report ("once it gets dark it stays dark")
 * that turned out to be neither: the cycle runs, night is simply half of it.
 */
export function formatClockLine(e: WorldClockSource): string {
    return `${formatWorldTime(e)} ${formatWeather(e)}`;
}

/**
 * Whether the world is currently DARK — night, or dark enough by weather that a
 * player would call it night. Used to tint the readout, which is the cheapest
 * possible answer to "is the day/night cycle even running": if the clock advances
 * and this flips, it is running.
 */
export function isDark(e: { dayFactor: number }): boolean {
    return e.dayFactor < 0.5;
}
