
// ratings.js
// Sagarin Ratings - Week 14 2025
// PREDICTOR column is used for predictive accuracy.
// HOME ADVANTAGE = 2.01

const HOME_ADVANTAGE = 2.01;

// Map Sagarin Name -> ESPN/App Name
// Note: App uses "Washington Commanders".
const RATINGS = {
    "Los Angeles Rams": 27.40,
    "Seattle Seahawks": 26.55,
    "Detroit Lions": 25.85,
    "Green Bay Packers": 24.65,
    "Buffalo Bills": 25.17,
    "Kansas City Chiefs": 25.39,
    "Houston Texans": 25.15,
    "Philadelphia Eagles": 24.14,
    "Denver Broncos": 23.09,
    "New England Patriots": 22.65,
    "Jacksonville Jaguars": 22.89,
    "San Francisco 49ers": 22.47,
    "Baltimore Ravens": 21.76,
    "Indianapolis Colts": 22.43,
    "Los Angeles Chargers": 20.71,
    "Chicago Bears": 20.07,
    "Pittsburgh Steelers": 20.25,
    "Tampa Bay Buccaneers": 19.47,
    "Minnesota Vikings": 19.60,
    "Dallas Cowboys": 18.55,
    "Cincinnati Bengals": 17.17,
    "Washington Commanders": 16.83, // Mapped from Washington Redskins
    "Miami Dolphins": 17.18,
    "Carolina Panthers": 16.32,
    "Arizona Cardinals": 16.80,
    "Atlanta Falcons": 15.90,
    "New York Giants": 15.74,
    "Cleveland Browns": 14.25,
    "Las Vegas Raiders": 13.23,
    "New York Jets": 13.14,
    "New Orleans Saints": 12.75,
    "Tennessee Titans": 12.45
};

export function getRating(teamName) {
    if (!teamName) return 15.0; // Average fallback
    // Try direct match
    if (RATINGS[teamName]) return RATINGS[teamName];

    // Fuzzy / Partial match?
    // ESPN "Washington" -> Map?
    // Usually ESPN names are full like "Washington Commanders".

    // Fallback for discrepancies
    if (teamName.includes("Washington")) return RATINGS["Washington Commanders"];

    return 15.0;
}

export { HOME_ADVANTAGE };
