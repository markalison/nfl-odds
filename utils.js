
export function getCurrentSeason() {
    const d = new Date();
    // If it's Jan/Feb, we are in the previous numerical year's season usually (e.g. Jan 2026 is 2025 season).
    // But for simplicity/safety with the prompt context (User mentioned 2025), let's return 2025.
    // Or logic: if Month < 3 (March), return Year - 1. Else Year.
    const month = d.getMonth(); // 0-11. Jan=0, Feb=1.
    if (month < 2) return d.getFullYear() - 1;
    return d.getFullYear();
}
