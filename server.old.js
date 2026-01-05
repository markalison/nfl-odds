
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
// import fetch from 'node-fetch'; // Native fetch in Node 18+ or Axios
import axios from 'axios';
import { Simulator } from './simulator.js';
import Endpoints from './endpoints.js';
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
    schedule: [],
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
        // 1. Teams (Basic Info + Record usually included or separate)
        // Using Endpoints.teams({ limit: 40 }) to get all NFL teams
        const teamsUrl = Endpoints.teams({ limit: 40 });
        console.log("Teams URL:", teamsUrl);

        const teamsRes = await axios.get(teamsUrl, AXIOS_CONFIG);
        const teamsData = teamsRes.data;

        const teams = {};

        if (teamsData.sports) {
            const league = teamsData.sports[0].leagues[0];
            league.teams.forEach(wrapper => {
                const team = wrapper.team;
                // Try to find record. In /teams list, it might be in 'record' object or missing.
                // If missing, we might need a separate call or fallback. 
                // Usually /teams includes a summary record.

                let record = { wins: 0, losses: 0, ties: 0 };
                // Sometimes team.record is present
                if (team.record) {
                    record = {
                        wins: team.record.items[0].stats.find(s => s.name === 'wins')?.value || 0,
                        losses: team.record.items[0].stats.find(s => s.name === 'losses')?.value || 0,
                        ties: team.record.items[0].stats.find(s => s.name === 'ties')?.value || 0
                    };
                }

                // Fallback: If 0-0-0 and we know season is on, we might need /standings.
                // But /standings failed for 2025. 
                // Maybe Endpoints.seasons(2025) schedule analysis can BUILD records?
                // The Simulator builds records from game results... 
                // But we need initial records. 
                // Let's assume for now /teams gives us something or we'll rely on the schedule reconstruction if needed.
                // Actually, if we fetch the FULL schedule (past and future), we can compute records ourselves! 
                // That is the most robust way if API fails.

                // We'll init with 0 and let schedule processing fill it if we process "computed" games?
                // No, schedule fetch below has 'completed' flag.

                const struct = getTeamStructure(team.abbreviation);

                // Debug log for structure
                if (team.abbreviation === 'BUF' || team.abbreviation === 'DAL') {
                    console.log(`Struct for ${team.abbreviation}:`, struct);
                }

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
        // Fetch full season schedule
        // Using Endpoints.seasons(2025) -> dates 20250901-20260201
        // Note: If today is Dec 2025, this is correct for 2025 season.
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
                    // Critical Check: Ensure both teams exist in our main team list
                    // If not (e.g. Pro Bowl, Hall of Fame game with non-standard IDs, or data drift), skip.
                    if (!teams[home.team.id] || !teams[away.team.id]) {
                        // console.warn(`Skipping game ${evt.id} - Unknown team(s): ${home.team.id} vs ${away.team.id}`);
                        return;
                    }

                    if (evt.status.type.completed) {
                        // We can use this to Calculate/Verify records!
                        completedGames.push({
                            homeId: home.team.id,
                            awayId: away.team.id,
                            homeScore: parseInt(home.score),
                            awayScore: parseInt(away.score)
                        });
                    } else {
                        // Future Game
                        schedule.push({
                            id: evt.id,
                            week: evt.week ? evt.week.number : 0,
                            homeId: home.team.id,
                            awayId: away.team.id,
                            completed: false
                        });
                    }
                }
            });
        }

        // RECALCULATE RECORDS if API was 0 (Backup Strategy)
        // If we have completed games, we can sum them up.
        // Good way to ensure consistency.

        // Reset records and stats to be safe before calc
        Object.values(teams).forEach(t => {
            t.record = { wins: 0, losses: 0, ties: 0 };
            t.stats = { pointsFor: 0, pointsAgainst: 0, gamesPlayed: 0 };
        });

        completedGames.forEach(g => {
            // Already filtered above

            // Update Stats
            if (teams[g.homeId] && teams[g.awayId]) {
                teams[g.homeId].stats.pointsFor += g.homeScore;
                teams[g.homeId].stats.pointsAgainst += g.awayScore;
                teams[g.homeId].stats.gamesPlayed++;

                teams[g.awayId].stats.pointsFor += g.awayScore;
                teams[g.awayId].stats.pointsAgainst += g.homeScore;
                teams[g.awayId].stats.gamesPlayed++;

                // Update Record
                if (g.homeScore > g.awayScore) {
                    teams[g.homeId].record.wins++;
                    teams[g.awayId].record.losses++;
                } else if (g.awayScore > g.homeScore) {
                    teams[g.awayId].record.wins++;
                    teams[g.homeId].record.losses++;
                } else {
                    teams[g.homeId].record.ties++;
                    teams[g.awayId].record.ties++;
                }
            }
        });

        console.log("Recalculated records from", completedGames.length, "completed games.");

        // Debug Stats for a few teams
        const debugIds = Object.keys(teams).slice(0, 3);
        debugIds.forEach(id => {
            const t = teams[id];
            console.log(`Team ${t.abbr || t.name}: ${t.record.wins}-${t.record.losses} | PF: ${t.stats.pointsFor} PA: ${t.stats.pointsAgainst} GP: ${t.stats.gamesPlayed}`);
        });

        cache.teams = teams;
        cache.schedule = schedule;
        cache.lastFetch = now;

    } catch (e) {
        console.error("Error fetching data:", e.message);
        if (e.response) console.error("Response:", e.response.status, e.response.statusText);
    }
}

// Routes
app.get('/api/data', async (req, res) => {
    await refreshData();
    res.json({ teams: cache.teams, schedule: cache.schedule });
});

app.post('/api/simulate', async (req, res) => {
    const userOverrides = req.body.overrides || {};
    await refreshData();
    const sim = new Simulator(cache.teams, cache.schedule);
    const results = sim.run(userOverrides);
    res.json(results);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
