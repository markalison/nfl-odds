export const TEAM_STRUCTURE = {
    "BUF": { conf: "AFC", div: "AFC East" },
    "MIA": { conf: "AFC", div: "AFC East" },
    "NE": { conf: "AFC", div: "AFC East" },
    "NYJ": { conf: "AFC", div: "AFC East" },
    "BAL": { conf: "AFC", div: "AFC North" },
    "CIN": { conf: "AFC", div: "AFC North" },
    "CLE": { conf: "AFC", div: "AFC North" },
    "PIT": { conf: "AFC", div: "AFC North" },
    "HOU": { conf: "AFC", div: "AFC South" },
    "IND": { conf: "AFC", div: "AFC South" },
    "JAX": { conf: "AFC", div: "AFC South" },
    "TEN": { conf: "AFC", div: "AFC South" },
    "DEN": { conf: "AFC", div: "AFC West" },
    "KC": { conf: "AFC", div: "AFC West" },
    "LV": { conf: "AFC", div: "AFC West" },
    "LAC": { conf: "AFC", div: "AFC West" },
    "DAL": { conf: "NFC", div: "NFC East" },
    "NYG": { conf: "NFC", div: "NFC East" },
    "PHI": { conf: "NFC", div: "NFC East" },
    "WSH": { conf: "NFC", div: "NFC East" },
    "CHI": { conf: "NFC", div: "NFC North" },
    "DET": { conf: "NFC", div: "NFC North" },
    "GB": { conf: "NFC", div: "NFC North" },
    "MIN": { conf: "NFC", div: "NFC North" },
    "ATL": { conf: "NFC", div: "NFC South" },
    "CAR": { conf: "NFC", div: "NFC South" },
    "NO": { conf: "NFC", div: "NFC South" },
    "TB": { conf: "NFC", div: "NFC South" },
    "ARI": { conf: "NFC", div: "NFC West" },
    "LAR": { conf: "NFC", div: "NFC West" },
    "SF": { conf: "NFC", div: "NFC West" },
    "SEA": { conf: "NFC", div: "NFC West" },
    // Aliases
    "WAS": { conf: "NFC", div: "NFC East" },
    "JAC": { conf: "AFC", div: "AFC South" }
};

export function getTeamStructure(abbr) {
    if (!abbr) return { conf: "NFL", div: "" };
    // Case-insensitive lookup just in case?
    // Let's rely on strict for now but safe getter
    return TEAM_STRUCTURE[abbr] || TEAM_STRUCTURE[abbr.toUpperCase()] || { conf: "NFL", div: "" };
}
