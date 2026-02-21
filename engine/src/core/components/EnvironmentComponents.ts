// -----------------------------------------------------------------------------
// 1. Core Environmental Data
// -----------------------------------------------------------------------------

export type WeatherCategory = "clear" | "cloud" | "rain" | "snow";

export interface EnvironmentStateComponent {
    // Solana/Chain Inputs
    currentHeight: number;
    currentHash: string;

    // Converted In-Game Time State
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;

    // Converted In-Game Weather State
    weatherCategory: WeatherCategory;
    weatherGrade: number; // 0 (light) to N (heavy)
}
