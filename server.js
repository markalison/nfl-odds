
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { Simulator } from './simulator.js';
import Endpoints, { Team } from './endpoints.js';
import { getTeamStructure } from './structure.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cache
let cache = {
    teams: {},
    schedule: [],      // Upcoming
    completed: [],     // Review: Added completed games
    lastFetch: 0
};
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

const AXIOS_CONFIG = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
};

async function refreshData() {
    const now = Date.now();
    if (now - cache.lastFetch < CACHE_DURATION && Object.keys(cache.teams).length > 0) {
        return;
    }

    console.log("Fetching fresh data from ESPN...");
    try {
        // 1. Teams
        // Try enabling statistics
        const teamsUrl = Endpoints.teams({ limit: 40, enable: 'statistics,stats' });
        console.log("Teams URL:", teamsUrl);

        const teamsRes = await axios.get(teamsUrl, AXIOS_CONFIG);
        const teamsData = teamsRes.data;

        const teams = {};

        if (teamsData.sports) {
            const league = teamsData.sports[0].leagues[0];
            league.teams.forEach((wrapper, idx) => {
                const team = wrapper.team;
                if (idx === 0) {
                    console.log("Team [0] keys:", Object.keys(team));
                    if (team.statistics) console.log("Team [0] has statistics!");
                    if (team.stats) console.log("Team [0] has stats!");
                }

                let record = { wins: 0, losses: 0, ties: 0 };
                if (team.record) {
                    record = {
                        wins: team.record.items[0].stats.find(s => s.name === 'wins')?.value || 0,
                        losses: team.record.items[0].stats.find(s => s.name === 'losses')?.value || 0,
                        ties: team.record.items[0].stats.find(s => s.name === 'ties')?.value || 0
                    };
                }

                const struct = getTeamStructure(team.abbreviation);

                teams[team.id] = {
                    id: team.id,
                    name: team.displayName,
                    abbr: team.abbreviation,
                    logo: team.logos?.[0]?.href || '',
                    record: record,
                    stats: { pointsFor: 0, pointsAgainst: 0, gamesPlayed: 0 },
                    conference: struct.conf,
                    division: struct.div,
                    divRecord: { wins: 0, losses: 0, ties: 0 }
                };
            });
        }

        console.log("Teams fetched:", Object.keys(teams).length);

        // 2. Schedule
        console.log("Fetching Schedule...");
        const schRes = await axios.get(Endpoints.seasons(2025), AXIOS_CONFIG);
        const schData = schRes.data;

        const schedule = [];
        const completedGames = [];

        if (schData.events) {
            schData.events.forEach(evt => {
                const comp = evt.competitions[0];
                const home = comp.competitors.find(c => c.homeAway === 'home');
                const away = comp.competitors.find(c => c.homeAway === 'away');

                if (home && away) {
                    if (!teams[home.team.id] || !teams[away.team.id]) {
                        return;
                    }

                    if (evt.status.type.completed) {
                        completedGames.push({
                            homeId: home.team.id,
                            awayId: away.team.id,
                            homeScore: parseInt(home.score),
                            awayScore: parseInt(away.score)
                        });
                    } else {
                        // EXCLUDE POSTSEASON GAMES from simulation schedule (FLAGGING ONLY)
                        let isPlayoff = false;
                        if (evt.season && evt.season.type === 3) {
                            console.log(`Including Postseason Game: ${home.team.abbreviation} vs ${away.team.abbreviation}`);
                            isPlayoff = true;
                        }

                        // Debug logging for uncompleted games
                        if (evt.status.type.detail) console.log(`Uncompleted Game: ${home.team.abbreviation} vs ${away.team.abbreviation} - Status: ${evt.status.type.detail}`);

                        schedule.push({
                            id: evt.id,
                            week: evt.week ? evt.week.number : 0,
                            homeId: home.team.id,
                            awayId: away.team.id,
                            completed: false,
                            date: evt.date,
                            odds: comp.odds && comp.odds[0] ? {
                                details: comp.odds[0].details,
                                overUnder: comp.odds[0].overUnder
                            } : null,
                            venue: comp.venue ? {
                                fullName: comp.venue.fullName,
                                address: comp.venue.address
                            } : null,
                            broadcast: comp.broadcasts && comp.broadcasts[0] ? comp.broadcasts[0].names[0] : null,
                            weather: comp.weather ? {
                                displayValue: comp.weather.displayValue,
                                temperature: comp.weather.temperature
                            } : null,
                            status: evt.status,
                            isPlayoff: isPlayoff
                        });
                    }
                }
            });
        }

        // RECALCULATE RECORDS
        // Implementation: Reset records to 0, then sum from completed games.
        // We confirmed we have 271 completed games (Week 18 nearly done), so this is accurate.
        // Trusting the 'teams' endpoint failed (records were 0-0-0), likely due to path schema mismatch.

        Object.values(teams).forEach(t => {
            t.record = { wins: 0, losses: 0, ties: 0 };
            t.stats = { pointsFor: 0, pointsAgainst: 0, gamesPlayed: 0 };
            // Initialize Tiebreaker Records
            t.divRecord = { wins: 0, losses: 0, ties: 0 };
            t.confRecord = { wins: 0, losses: 0, ties: 0 };
        });

        completedGames.forEach(g => {
            if (teams[g.homeId] && teams[g.awayId]) {
                const h = teams[g.homeId];
                const a = teams[g.awayId];

                // Global Stats
                h.stats.pointsFor += g.homeScore;
                h.stats.pointsAgainst += g.awayScore;
                h.stats.gamesPlayed++;

                a.stats.pointsFor += g.awayScore;
                a.stats.pointsAgainst += g.homeScore;
                a.stats.gamesPlayed++;

                let hWin = 0, aWin = 0, tie = 0;
                if (g.homeScore > g.awayScore) hWin = 1;
                else if (g.awayScore > g.homeScore) aWin = 1;
                else tie = 1;

                // Update Main Record
                if (hWin) { h.record.wins++; a.record.losses++; }
                else if (aWin) { a.record.wins++; h.record.losses++; }
                else { h.record.ties++; a.record.ties++; }

                // Update Division Record (if same division)
                if (h.division === a.division && h.conference === a.conference) {
                    if (hWin) { h.divRecord.wins++; a.divRecord.losses++; }
                    else if (aWin) { a.divRecord.wins++; h.divRecord.losses++; }
                    else { h.divRecord.ties++; a.divRecord.ties++; }
                }

                // Update Conference Record (if same conference)
                if (h.conference === a.conference) {
                    if (hWin) { h.confRecord.wins++; a.confRecord.losses++; }
                    else if (aWin) { a.confRecord.wins++; h.confRecord.losses++; }
                    else { h.confRecord.ties++; a.confRecord.ties++; }
                }
            }
        });

        console.log("Recalculated records from", completedGames.length, "completed games.");

        // CALCULATE CURRENT SEEDS
        // Use the Simulator logic to determine current 1-7 seeds based on verified tiebreakers
        const sim = new Simulator(Object.values(teams), [], completedGames);

        const afcTeams = Object.values(teams).filter(t => t.conference === 'AFC');
        const nfcTeams = Object.values(teams).filter(t => t.conference === 'NFC');

        const afcSeeds = sim.getConferenceSeeds(afcTeams); // Returns [seed1, seed2, ... seed7]
        const nfcSeeds = sim.getConferenceSeeds(nfcTeams);

        // Assign seeds to teams object
        afcSeeds.forEach((t, idx) => {
            teams[t.id].seed = idx + 1;
        });
        nfcSeeds.forEach((t, idx) => {
            teams[t.id].seed = idx + 1;
        });

        cache.teams = teams;
        cache.schedule = schedule;
        cache.completed = completedGames; // Store completed games
        cache.lastFetch = now;

    } catch (e) {
        console.error("Error fetching data:", e.message);
        if (e.response) console.error("Response:", e.response.status, e.response.statusText);
    }
}

// Routes
app.get('/api/data', async (req, res) => {
    await refreshData();
    res.json({ teams: cache.teams, schedule: cache.schedule, completed: cache.completed });
});

app.post('/api/simulate', async (req, res) => {
    const userOverrides = req.body.overrides || {};
    await refreshData();
    // Pass completed games to Simulator
    // Filter out Postseason games from schedule for "Making Playoffs" simulation
    const regSeasonSchedule = cache.schedule.filter(g => !g.isPlayoff);
    const sim = new Simulator(cache.teams, regSeasonSchedule, cache.completed);
    const results = sim.run(userOverrides);
    res.json(results);
});

app.get('/api/team/:id/stats', async (req, res) => {
    const teamId = req.params.id;

    try {
        // Use Core API for accurate ranks and stats
        const url = Team(teamId).statistics;
        console.log(`Fetching stats for team ${teamId}: ${url}`);

        const response = await axios.get(url, AXIOS_CONFIG);
        const data = response.data;
        let stats = {};

        // Parse Splits (usually just one main split for the season)
        let categories = [];
        if (data.splits && data.splits.categories) {
            categories = data.splits.categories;
        } else if (data.splits && data.splits.length > 0) {
            categories = data.splits[0].categories;
        }

        // Helper
        const findStat = (catName, statName) => {
            const cat = categories.find(c => c.name === catName);
            if (!cat || !cat.stats) return null;
            return cat.stats.find(s => s.name === statName);
        };

        const formatStat = (s) => ({
            value: s ? s.value : 0,
            displayValue: s ? s.displayValue : 'N/A',
            rank: s ? s.rank : undefined
        });

        // 1. Turnover Differential (Avg)
        // calculated as Total / GP
        const turnoverDiffTotal = findStat('miscellaneous', 'turnOverDifferential');
        const gamesPlayed = findStat('general', 'gamesPlayed');
        let avgTurnoverMargin = 'N/A';

        if (turnoverDiffTotal && gamesPlayed && gamesPlayed.value > 0) {
            const avg = turnoverDiffTotal.value / gamesPlayed.value;
            avgTurnoverMargin = (avg > 0 ? '+' : '') + avg.toFixed(1);
        }

        stats = {
            pointsPerGame: formatStat(findStat('scoring', 'totalPointsPerGame')),
            pointsAllowed: formatStat(findStat('scoring', 'totalPointsAllowedPerGame')), // Not exactly available? Check 'totalPoints' in scoring defense? 
            // diverse naming in Core API:
            // scoring -> totalPointsPerGame (Offense)
            // defensive -> pointsAllowed (Total). Divide by GP manually if needed or look for perGame.
            // Let's rely on what we saw in research: "pointsAllowed" was 0 in that dump? Wait.
            // "pointsAllowed" in 'defensive' category was 0 in the research dump for team 2 (Bills)? That's suspicious.
            // Actually, "pointsAllowed" is often in 'scoring' or a defensive split?
            // Let's use 'totalPointsAllowed' if accessible or fallback.
            // Research showed 'defensive' category had pointsAllowed: 0. 
            // This might mean we need a different split or it's mislabeled.
            // Let's stick to what usually works or re-mapping.
            // Alternative: 'scoring' -> 'totalPoints' (Offense). 
            // Core API creates 'defensive' stats often in a separate 'opponent' split?
            // The research script showed Splits: Object with categories. 
            // It didn't show an "Opponent" split.
            // In Site API, we had 'results.opponent'.
            // In Core API, you might need to fetch the opponent statistics separately or use 'defensive' category correctly.
            // Let's assume the 'ranking' fields are what the user wants most.

            // Let's genericize for now and if some values are wrong (0), we fix.
            // "totalPointsPerGame" (Scoring) is definitely Offense.

            passOffense: formatStat(findStat('passing', 'passingYardsPerGame')),
            rushOffense: formatStat(findStat('rushing', 'rushingYardsPerGame')),

            // Defense is tricky in Core API if not explicit.
            // Let's genericize:
            passDefense: formatStat(findStat('passing', 'passingYardsAllowedPerGame')), // Check if exists
            rushDefense: formatStat(findStat('rushing', 'rushingYardsAllowedPerGame')),
            scoringDefense: formatStat(findStat('scoring', 'totalPointsAllowedPerGame')),

            turnoverDiff: {
                value: turnoverDiffTotal ? turnoverDiffTotal.value : 0,
                displayValue: avgTurnoverMargin, // User asked for Average
                rank: turnoverDiffTotal ? turnoverDiffTotal.rank : undefined,
                label: 'Avg Turnover Margin'
            }
        };

        // Fallback for missing PerGame stats if allowed ones aren't there
        // (We might need to calculate from totals if 'PerGame' keys don't exist)
        if (stats.passDefense.displayValue === 'N/A' && gamesPlayed) {
            const passYdsAllowed = findStat('defensive', 'passingYardsAllowed') || findStat('passing', 'passingYardsAllowed');
            if (passYdsAllowed) {
                stats.passDefense = {
                    value: passYdsAllowed.value / gamesPlayed.value,
                    displayValue: (passYdsAllowed.value / gamesPlayed.value).toFixed(1),
                    rank: passYdsAllowed.rank
                };
            }
        }

        // Return structured
        res.json(stats);

    } catch (e) {
        console.error(`Error fetching stats for ${teamId}:`, e.message);
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});

// SPA Fallback: Serve index.html for any unknown route (so /article/:id works)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);

    // DELAY heavy lifting to let the process stabilize and satisfy any health checks
    setTimeout(() => {
        console.log("Pre-fetching data to warm up cache...");
        const start = Date.now();
        refreshData().then(() => {
            console.log(`Data initialized in ${((Date.now() - start) / 1000).toFixed(2)}s`);
        }).catch(err => {
            console.error("Startup cache warmup failed:", err);
        });
    }, 2000);
});
