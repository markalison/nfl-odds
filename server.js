
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
let simCache = new Map(); // Global cache for established projections
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
        const completedRegSeason = [];
        const completedPostSeason = [];
        const clinchedTeamIds = new Set();
        const playoffResults = {}; // { "ABBR1-ABBR2": winnerId }

        if (schData.events) {
            schData.events.forEach(evt => {
                const comp = evt.competitions[0];
                const home = comp.competitors.find(c => c.homeAway === 'home');
                const away = comp.competitors.find(c => c.homeAway === 'away');

                if (home && away) {
                    if (!teams[home.team.id] || !teams[away.team.id]) return;

                    const isPlayoff = evt.season && evt.season.type === 3;
                    const gameObj = {
                        id: evt.id,
                        week: evt.week ? evt.week.number : 0,
                        homeId: home.team.id,
                        awayId: away.team.id,
                        homeScore: parseInt(home.score) || 0,
                        awayScore: parseInt(away.score) || 0,
                        completed: evt.status.type.completed,
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
                        status: {
                            ...evt.status,
                            state: evt.status.type.state // 'pre', 'in', or 'post'
                        },
                        isPlayoff: isPlayoff
                    };

                    if (isPlayoff) {
                        clinchedTeamIds.add(String(home.team.id));
                        clinchedTeamIds.add(String(away.team.id));
                    }

                    if (evt.status.type.completed) {
                        if (isPlayoff) {
                            completedPostSeason.push(gameObj);
                            const winner = parseInt(home.score) > parseInt(away.score) ? home.team.id : away.team.id;
                            const key = [home.team.abbreviation, away.team.abbreviation].sort().join('-');
                            playoffResults[key] = winner;
                        } else {
                            completedRegSeason.push(gameObj);
                        }
                    } else {
                        schedule.push(gameObj);
                    }
                }
            });
        }

        // RESET RECORDS
        Object.values(teams).forEach(t => {
            t.record = { wins: 0, losses: 0, ties: 0 };
            t.stats = { pointsFor: 0, pointsAgainst: 0, gamesPlayed: 0 };
            t.divRecord = { wins: 0, losses: 0, ties: 0 };
            t.confRecord = { wins: 0, losses: 0, ties: 0 };
        });

        // ONLY USE REGULAR SEASON FOR STANDINGS/RECORDS/STATS
        completedRegSeason.forEach(g => {
            const h = teams[g.homeId];
            const a = teams[g.awayId];
            if (!h || !a) return;

            h.stats.pointsFor += g.homeScore;
            h.stats.pointsAgainst += g.awayScore;
            h.stats.gamesPlayed++;
            a.stats.pointsFor += g.awayScore;
            a.stats.pointsAgainst += g.homeScore;
            a.stats.gamesPlayed++;

            if (g.homeScore > g.awayScore) {
                h.record.wins++; a.record.losses++;
                if (h.division === a.division && h.conference === a.conference) { h.divRecord.wins++; a.divRecord.losses++; }
                if (h.conference === a.conference) { h.confRecord.wins++; a.confRecord.losses++; }
            } else if (g.awayScore > g.homeScore) {
                a.record.wins++; h.record.losses++;
                if (h.division === a.division && h.conference === a.conference) { a.divRecord.wins++; h.divRecord.losses++; }
                if (h.conference === a.conference) { a.confRecord.wins++; h.confRecord.losses++; }
            } else {
                h.record.ties++; a.record.ties++;
                if (h.division === a.division && h.conference === a.conference) { h.divRecord.ties++; a.divRecord.ties++; }
                if (h.conference === a.conference) { h.confRecord.ties++; a.confRecord.ties++; }
            }
        });

        console.log(`Initialized with ${completedRegSeason.length} reg season and ${completedPostSeason.length} post season games.`);
        console.log(`Clinched Teams: ${Array.from(clinchedTeamIds).map(id => teams[id]?.abbr).join(', ')}`);

        // CALCULATE CURRENT SEEDS (Reg Season Only)
        // Pass regular season data to calculate what the seeds WOULD BE or ARE for bracket initialization
        const seedSim = new Simulator(teams, [], completedRegSeason);
        const afcSeeds = seedSim.getConferenceSeeds(Object.values(teams).filter(t => t.conference === 'AFC'));
        const nfcSeeds = seedSim.getConferenceSeeds(Object.values(teams).filter(t => t.conference === 'NFC'));

        afcSeeds.forEach((t, idx) => { if (teams[t.id]) teams[t.id].seed = idx + 1; });
        nfcSeeds.forEach((t, idx) => { if (teams[t.id]) teams[t.id].seed = idx + 1; });

        cache.teams = teams;
        cache.schedule = schedule;
        cache.completed = [...completedRegSeason, ...completedPostSeason];
        cache.clinchedTeamIds = Array.from(clinchedTeamIds);
        cache.playoffResults = playoffResults;
        cache.lastFetch = now;
        simCache.clear();

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

    // Generate a cache key from overrides
    // Sorting keys ensures different orders of same overrides result in same key
    const cacheKey = JSON.stringify(Object.keys(userOverrides).sort().reduce((obj, key) => {
        obj[key] = userOverrides[key];
        return obj;
    }, {}));

    if (simCache.has(cacheKey)) {
        console.log("Serving ESTABLISHED projection from cache.");
        return res.json(simCache.get(cacheKey));
    }

    // Pass full schedule to Simulator to enable game-specific stat tracking
    const sim = new Simulator(
        cache.teams,
        cache.schedule,
        cache.completed,
        cache.clinchedTeamIds,
        cache.playoffResults
    );

    console.log(`Generating NEW established projection (1000 sims) with ${cache.clinchedTeamIds.length} clinched teams...`);
    const results = sim.run(userOverrides);

    simCache.set(cacheKey, results);
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
