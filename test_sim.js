
import { Simulator } from './simulator.js';

// Mock Teams
const teams = {
    'BUF': { id: 'BUF', name: 'Bills', conference: 'AFC', division: 'AFC East', record: { wins: 10, losses: 6, ties: 0 }, divRecord: { wins: 3, losses: 2, ties: 0 }, stats: { pointsFor: 400, pointsAgainst: 300, gamesPlayed: 16 } },
    'MIA': { id: 'MIA', name: 'Dolphins', conference: 'AFC', division: 'AFC East', record: { wins: 9, losses: 7, ties: 0 }, divRecord: { wins: 2, losses: 3, ties: 0 }, stats: { pointsFor: 350, pointsAgainst: 350, gamesPlayed: 16 } },
    'KC': { id: 'KC', name: 'Chiefs', conference: 'AFC', division: 'AFC West', record: { wins: 12, losses: 4, ties: 0 }, divRecord: { wins: 4, losses: 1, ties: 0 }, stats: { pointsFor: 450, pointsAgainst: 300, gamesPlayed: 16 } },
    'CIN': { id: 'CIN', name: 'Bengals', conference: 'AFC', division: 'AFC North', record: { wins: 11, losses: 5, ties: 0 }, divRecord: { wins: 3, losses: 2, ties: 0 }, stats: { pointsFor: 420, pointsAgainst: 310, gamesPlayed: 16 } },
    'HOU': { id: 'HOU', name: 'Texans', conference: 'AFC', division: 'AFC South', record: { wins: 8, losses: 8, ties: 0 }, divRecord: { wins: 2, losses: 3, ties: 0 }, stats: { pointsFor: 300, pointsAgainst: 320, gamesPlayed: 16 } },
    'BAL': { id: 'BAL', name: 'Ravens', conference: 'AFC', division: 'AFC North', record: { wins: 10, losses: 6, ties: 0 }, divRecord: { wins: 3, losses: 2, ties: 0 }, stats: { pointsFor: 410, pointsAgainst: 310, gamesPlayed: 16 } },
    'LAC': { id: 'LAC', name: 'Chargers', conference: 'AFC', division: 'AFC West', record: { wins: 9, losses: 7, ties: 0 }, divRecord: { wins: 2, losses: 3, ties: 0 }, stats: { pointsFor: 380, pointsAgainst: 360, gamesPlayed: 16 } },
    'PHI': { id: 'PHI', name: 'Eagles', conference: 'NFC', division: 'NFC East', record: { wins: 13, losses: 3, ties: 0 }, divRecord: { wins: 5, losses: 0, ties: 0 }, stats: { pointsFor: 460, pointsAgainst: 290, gamesPlayed: 16 } },
    'SF': { id: 'SF', name: '49ers', conference: 'NFC', division: 'NFC West', record: { wins: 12, losses: 4, ties: 0 }, divRecord: { wins: 4, losses: 1, ties: 0 }, stats: { pointsFor: 440, pointsAgainst: 300, gamesPlayed: 16 } },
    'DET': { id: 'DET', name: 'Lions', conference: 'NFC', division: 'NFC North', record: { wins: 11, losses: 5, ties: 0 }, divRecord: { wins: 4, losses: 1, ties: 0 }, stats: { pointsFor: 430, pointsAgainst: 350, gamesPlayed: 16 } },
    'TB': { id: 'TB', name: 'Buccaneers', conference: 'NFC', division: 'NFC South', record: { wins: 8, losses: 8, ties: 0 }, divRecord: { wins: 3, losses: 2, ties: 0 }, stats: { pointsFor: 320, pointsAgainst: 340, gamesPlayed: 16 } },
    'DAL': { id: 'DAL', name: 'Cowboys', conference: 'NFC', division: 'NFC East', record: { wins: 10, losses: 6, ties: 0 }, divRecord: { wins: 3, losses: 2, ties: 0 }, stats: { pointsFor: 400, pointsAgainst: 380, gamesPlayed: 16 } },
    'LAR': { id: 'LAR', name: 'Rams', conference: 'NFC', division: 'NFC West', record: { wins: 9, losses: 7, ties: 0 }, divRecord: { wins: 2, losses: 3, ties: 0 }, stats: { pointsFor: 390, pointsAgainst: 390, gamesPlayed: 16 } },
    'GB': { id: 'GB', name: 'Packers', conference: 'NFC', division: 'NFC North', record: { wins: 8, losses: 8, ties: 0 }, divRecord: { wins: 2, losses: 3, ties: 0 }, stats: { pointsFor: 360, pointsAgainst: 360, gamesPlayed: 16 } }
};

// Mock partially filled games if needed, or leave empty to just sim nothing or just process seeds
const games = [
    { id: 'g1', homeId: 'BUF', awayId: 'MIA', completed: false }
];

console.log("Starting Sim Test...");

try {
    const sim = new Simulator(teams, games, []);
    sim.ITERATIONS = 10;
    const results = sim.run({});
    console.log("Sim Success!");

    // Check if wonSuperBowl is populated
    const sb = Object.values(results).map(r => r.wonSuperBowl).reduce((a, b) => a + b, 0);
    console.log("Total Super Bowl Wins Distributed:", sb);

    console.log("Win SB Stats (Top 5):",
        Object.values(results)
            .sort((a, b) => b.wonSuperBowl - a.wonSuperBowl)
            .slice(0, 5)
            .map(r => `${r.id}:${r.wonSuperBowl}`)
            .join(', ')
    );
} catch (err) {
    console.error("Sim Crash:", err);
}
