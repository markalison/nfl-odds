
const HOME_ADVANTAGE = 2.0;

export class Simulator {
    constructor(teams, games, completedGames = []) {
        // Teams: { [id]: { record: {w,l,t}, conference, division, ... } }
        // Games: [ { homeId, awayId, completed: false, ... } ]
        this.teams = teams;
        this.games = games;
        this.completedGames = completedGames;
        this.teams = teams;
        this.games = games;
        this.completedGames = completedGames;
        this.ITERATIONS = 50; // Ultra-safe mode for shared hosting

        this.h2hMatrix = this.buildH2HMatrix();
    }

    buildH2HMatrix() {
        const h2h = {}; // { "winnerId-loserId": wins }
        this.completedGames.forEach(g => {
            let winner, loser;
            if (g.homeScore > g.awayScore) { winner = g.homeId; loser = g.awayId; }
            else if (g.awayScore > g.homeScore) { winner = g.awayId; loser = g.homeId; }
            else return; // Ties don't count for H2H win count strictly

            const key = `${winner}-${loser}`;
            h2h[key] = (h2h[key] || 0) + 1;
        });
        return h2h;
    }

    run(userOverrides = {}) {
        // userOverrides: { [teamId]: 'win' | 'loss' | 'tie' | 'out' }
        // Note: 'out' (win out) is a special case that pre-processes the games list.

        const results = {};

        // Initialize results buckets
        Object.keys(this.teams).forEach(id => {
            results[id] = {
                id: id,
                madePlayoffs: 0, // === Reached WC Round
                wonDivision: 0,
                seed1: 0,
                seed2: 0,
                seed3: 0,
                seed4: 0, // Div winners
                seed5: 0,
                seed6: 0,
                seed7: 0,
                madeDivisional: 0,
                madeConference: 0,
                madeSuperBowl: 0,
                wonSuperBowl: 0,
                totalSims: 0
            };
        });


        const start = performance.now();
        const gameStats = {}; // { [gameId]: { homeWins: 0, total: 0 } }
        const matchupStats = {}; // { [round]: { [matchupKey]: { count, p1, p2 } } }

        // 1. Pre-process games based on overrides
        let simBaseTeams = JSON.parse(JSON.stringify(this.teams));


        // Identify "Next Games" for overrides
        const teamNextGameId = {};
        for (const game of this.games) {
            if (!teamNextGameId[game.homeId]) teamNextGameId[game.homeId] = game.id;
            if (!teamNextGameId[game.awayId]) teamNextGameId[game.awayId] = game.id;
        }

        const fixedGames = {};
        const playoffOverrides = {};

        for (const [key, action] of Object.entries(userOverrides)) {
            if (action === 'none') continue;

            // Check if key is a Playoff Matchup Key (e.g. "BUF-KC")
            // IDs are usually numeric strings. Matchups are "ABBR-ABBR".
            // Or "sortedId" from frontend.
            if (key.includes('-')) {
                // It's a playoff override. Value is "WinnerID" (as passed by frontend `updateSimWithOverride` -> `runSimulation` -> `fetch`)
                // But wait, `runSimulation` sends `overrides = { [winnerId]: 'win' }` ???
                // NO, `userAction` does `USER_OVERRIDES[teamId] = action`.
                // My new `updateSimWithOverride` in app.js sets `USER_ARROWS[sortedId] = winnerId`.
                // Then `runSimulation` collects `USER_ARROWS`?
                // I need to check `app.js` `runSimulation`.

                // Ah, in `app.js` `runSimulation` (Line 58 in viewed code):
                // `const overrides = {}; Object.values(USER_ARROWS).forEach(winnerId => { overrides[winnerId] = 'win'; });`
                // OLD LOGIC WAS WRONG for the new Bracket System.
                // I need to update `app.js` `runSimulation` to pass the raw `USER_ARROWS` (or equivalent) to backend.

                // If I fix `app.js` to send `{ "KC-BUF": "12" }`, then here in `run` I get `key="KC-BUF"`, `value="12"`.
                playoffOverrides[key] = action; // 'action' here is the winner ID
                continue;
            }

            // Regular Season (Team ID based)
            const teamId = key;
            const gId = teamNextGameId[teamId];
            if (gId) {
                const game = this.games.find(g => g.id === gId);
                if (game) {
                    let outcome = null;
                    if (teamId === game.homeId) {
                        if (action === 'win') outcome = 'home';
                        else if (action === 'loss') outcome = 'away';
                        else if (action === 'tie') outcome = 'tie';
                    } else {
                        if (action === 'win') outcome = 'away';
                        else if (action === 'loss') outcome = 'home';
                        else if (action === 'tie') outcome = 'tie';
                    }
                    if (outcome) fixedGames[gId] = outcome;
                }
            }
        }

        const gamesToSimulate = [];
        for (const game of this.games) {
            if (fixedGames[game.id]) {
                this.updateStandings(simBaseTeams, game.homeId, game.awayId, fixedGames[game.id]);
            } else {
                gamesToSimulate.push(game);
            }
        }

        // 2. Run Iterations
        for (let i = 0; i < this.ITERATIONS; i++) {
            const runTeams = JSON.parse(JSON.stringify(simBaseTeams));

            // Sim remaining games
            for (const game of gamesToSimulate) {
                const homeT = runTeams[game.homeId];
                const awayT = runTeams[game.awayId];
                if (!homeT || !awayT) continue;

                const result = this.simulateMatchup(homeT, awayT);
                this.updateStandings(runTeams, game.homeId, game.awayId, result);

                // Track Game Stats
                if (!gameStats[game.id]) gameStats[game.id] = { homeWins: 0, total: 0 };
                gameStats[game.id].total++;
                if (result === 'home') gameStats[game.id].homeWins++;
            }

            // 3. Determine Playoff Seeds
            const { afcSeeds, nfcSeeds } = this.processPlayoffSeeds(runTeams, results);

            // 4. Simulate Playoffs (New)
            this.simulatePlayoffs(afcSeeds, nfcSeeds, results, matchupStats, playoffOverrides);
        }

        // Set totalSims
        Object.keys(results).forEach(id => {
            results[id].totalSims = this.ITERATIONS;
        });

        const end = performance.now();
        console.log(`Simulation x${this.ITERATIONS} took ${(end - start).toFixed(2)} ms`);

        return { teams: results, games: gameStats, matchups: matchupStats };
    }

    updateStandings(teams, homeId, awayId, result) {
        const h = teams[homeId];
        const a = teams[awayId];

        if (result === 'home') {
            h.record.wins++;
            a.record.losses++;
        } else if (result === 'away') {
            a.record.wins++;
            h.record.losses++;
        } else {
            h.record.ties++;
            a.record.ties++;
        }

        const sameDiv = h.division === a.division && h.conference === a.conference;
        const sameConf = h.conference === a.conference;

        if (sameDiv) {
            if (result === 'home') { h.divRecord.wins++; a.divRecord.losses++; }
            else if (result === 'away') { a.divRecord.wins++; h.divRecord.losses++; }
            else { h.divRecord.ties++; a.divRecord.ties++; }
        }

        if (sameConf) {
            if (result === 'home') { h.confRecord.wins++; a.confRecord.losses++; }
            else if (result === 'away') { a.confRecord.wins++; h.confRecord.losses++; }
            else { h.confRecord.ties++; a.confRecord.ties++; }
        }
    }

    getWinPct(team) {
        const total = team.record.wins + team.record.losses + team.record.ties;
        if (total === 0) return 0;
        return (team.record.wins + 0.5 * team.record.ties) / total;
    }

    simulateMatchup(home, away) {
        const getRat = (t) => {
            if (t.stats.gamesPlayed === 0) return 0;
            return (t.stats.pointsFor - t.stats.pointsAgainst) / t.stats.gamesPlayed;
        };
        const rh = getRat(home);
        const ra = getRat(away);

        const spread = rh - ra + 2.0; // +2.0 Home Advantage
        const prob = 1 / (1 + Math.pow(10, -(spread / 16)));

        return Math.random() < prob ? 'home' : 'away';
    }

    simulatePlayoffs(afcSeeds, nfcSeeds, results, matchupStats, playoffOverrides = {}) {
        if (afcSeeds.length < 7 || nfcSeeds.length < 7) return;

        // TRACK MADE DIV (Byes)
        results[afcSeeds[0].id].madeDivisional++;
        results[nfcSeeds[0].id].madeDivisional++;

        // Helper to record matchup
        const track = (round, t1, t2) => {
            if (!matchupStats[round]) matchupStats[round] = {};
            // Sorted key so KC-BUF is same as BUF-KC
            const key = [t1.abbr, t2.abbr].sort().join('-');
            if (!matchupStats[round][key]) matchupStats[round][key] = { count: 0, p1: t1, p2: t2 };
            matchupStats[round][key].count++;
        };

        const play = (t1, t2, round) => {
            track(round, t1, t2);

            // CHECK OVERRIDES
            const key = [t1.abbr, t2.abbr].sort().join('-');
            if (playoffOverrides[key]) {
                return String(playoffOverrides[key]) === String(t1.id) ? t1 : t2;
            }

            let winner = this.simulateMatchup(t1, t2);
            while (winner === 'tie') winner = Math.random() < 0.5 ? 'home' : 'away';
            return winner === 'home' ? t1 : t2;
        };

        const runConf = (seeds, confName) => {
            // Wild Card (Round 1)
            // Seeds indices: 0=1st, 1=2nd... 6=7th
            const w2v7 = play(seeds[1], seeds[6], 'WC');
            const w3v6 = play(seeds[2], seeds[5], 'WC');
            const w4v5 = play(seeds[3], seeds[4], 'WC');

            // Winners make Div
            results[w2v7.id].madeDivisional++;
            results[w3v6.id].madeDivisional++;
            results[w4v5.id].madeDivisional++;

            // Divisional (Round 2)
            const living = [seeds[0], w2v7, w3v6, w4v5];
            const getSeedIdx = (t) => seeds.findIndex(s => s.id === t.id);
            living.sort((a, b) => getSeedIdx(a) - getSeedIdx(b)); // Lowest index = Highest seed

            const div1 = play(living[0], living[3], 'DIV'); // 1 vs Lowest
            const div2 = play(living[1], living[2], 'DIV'); // 2nd Best vs 3rd Best

            // Winners make Conf
            results[div1.id].madeConference++;
            results[div2.id].madeConference++;

            // Conference (Round 3)
            const c1 = div1;
            const c2 = div2;
            const idx1 = getSeedIdx(c1);
            const idx2 = getSeedIdx(c2);
            // Higher seed hosts
            const confWinner = idx1 < idx2 ? play(c1, c2, 'CONF') : play(c2, c1, 'CONF');

            // Winner makes SB
            results[confWinner.id].madeSuperBowl++;

            return confWinner;
        };

        const afcWinner = runConf(afcSeeds, 'AFC');
        const nfcWinner = runConf(nfcSeeds, 'NFC');

        // Super Bowl (Round 4)
        const sbWinner = play(afcWinner, nfcWinner, 'SB');
        results[sbWinner.id].wonSuperBowl++;
    }



    processPlayoffSeeds(teamsMap, results) {
        const teamList = Object.values(teamsMap);
        const afc = teamList.filter(t => t.conference === 'AFC');
        const nfc = teamList.filter(t => t.conference === 'NFC');

        const afcSeeds = this.getConferenceSeeds(afc);
        const nfcSeeds = this.getConferenceSeeds(nfc);

        // Record seed counts for results
        afcSeeds.forEach((t, idx) => this.recordSeed(results, t.id, idx + 1));
        nfcSeeds.forEach((t, idx) => this.recordSeed(results, t.id, idx + 1));

        return { afcSeeds, nfcSeeds };
    }

    getConferenceSeeds(confTeams) {
        // Determine current standings (Seeds 1-7)

        // Group by Division
        const divisions = {};
        confTeams.forEach(t => {
            if (!divisions[t.division]) divisions[t.division] = [];
            divisions[t.division].push(t);
        });

        // Find Division Winners
        const divWinners = [];
        const wildCards = [];

        for (const divName in divisions) {
            const dTeams = divisions[divName];
            dTeams.sort((a, b) => this.getWinPct(b) - this.getWinPct(a));
            const ranked = this.resolveTies(dTeams, null, 'division'); // runH2H null for current standings

            divWinners.push(ranked[0]);
            for (let i = 1; i < ranked.length; i++) wildCards.push(ranked[i]);
        }

        // Sort Div Winners (Seeds 1-4)
        const rankedWinners = this.resolveTies(divWinners, null, 'conference');

        // Sort Wildcards (Seeds 5-7)
        const rankedWildCards = this.iterativeWildCardSort(wildCards);

        // Return ordered list of 7 playoff teams
        return [...rankedWinners, ...rankedWildCards.slice(0, 3)];
    }

    resolveTies(teams, runH2H, level) {
        // Sort by Win Pct first (Bucketing)
        teams.sort((a, b) => this.getWinPct(b) - this.getWinPct(a));

        let finalRank = [];
        let bucket = [teams[0]];

        for (let i = 1; i < teams.length; i++) {
            const t = teams[i];
            const prev = bucket[0];
            if (Math.abs(this.getWinPct(t) - this.getWinPct(prev)) < 0.001) {
                bucket.push(t);
            } else {
                finalRank.push(...this.breakTies(bucket, runH2H, level));
                bucket = [t];
            }
        }
        finalRank.push(...this.breakTies(bucket, runH2H, level));
        return finalRank;
    }

    breakTies(teams, runH2H, level) {
        if (teams.length <= 1) return teams; // Only one team, no tie
        // All ties through full hierarchy

        const self = this;

        // TIEBREAKER HIERARCHY (Simulated via Reverse Priority Sorting)
        // 1. Head-to-Head (Highest)
        // 2. Division Record (if div tie)
        // 3. Conference Record
        // 4. Common Games (min 4)
        // 5. Strength of Victory (SOV)
        // 6. Strength of Schedule (SOS) - Fallback

        // We apply sorts from LOWEST priority to HIGHEST priority.
        // Javascript sort is stable, so higher priority sorts preserve order of lower priority sorts unless they differ.

        // F. Strength of Schedule (Not implemented, fallback random/ID stability)

        // E. Strength of Victory (SOV)
        teams.forEach(t => t._sov = this.calculateSOV(t));
        teams.sort((a, b) => b._sov - a._sov);

        // CONDITIONAL ORDER: Common Games vs Conference Record
        // DIVISION TIE: Common Games (Step 3) > Conference Record (Step 4)
        // -> Apply Conf (Low) then Common (High)
        // CONFERENCE TIE (Wild Card): Conference Record (Step 2) > Common Games (Step 3)
        // -> Apply Common (Low) then Conf (High)

        if (level === 'division') {
            // Division: Conf (Low) -> Common (High)
            teams.sort((a, b) => self.getStatPct(b, 'confRecord') - self.getStatPct(a, 'confRecord'));
            this.applyCommonGamesSort(teams);
        } else {
            // Wild Card: Common (Low) -> Conf (High)
            this.applyCommonGamesSort(teams);
            teams.sort((a, b) => self.getStatPct(b, 'confRecord') - self.getStatPct(a, 'confRecord'));
        }

        // B. Division Record 
        if (level === 'division') {
            teams.sort((a, b) => self.getStatPct(b, 'divRecord') - self.getStatPct(a, 'divRecord'));
        }

        // A. Head-to-Head (Highest Priority)
        // Calculate H2H stats
        const groupIds = teams.map(t => t.id);
        const groupRecs = {};
        groupIds.forEach(id => groupRecs[id] = { w: 0, l: 0 });
        groupIds.forEach(id1 => {
            groupIds.forEach(id2 => {
                if (id1 === id2) return;
                const wins = this.h2hMatrix[`${id1}-${id2}`] || 0;
                groupRecs[id1].w += wins;
                const losses = this.h2hMatrix[`${id2}-${id1}`] || 0;
                groupRecs[id1].l += losses;
            });
        });
        const getH2HPct = (rec) => {
            const tot = rec.w + rec.l;
            return tot === 0 ? 0 : rec.w / tot;
        }

        // Check if H2H is Valid (Sweep for 3+, or Div match)
        const validH2H = (level === 'division') || this.checkSweep(groupRecs, groupIds.length);

        // A. Head-to-Head (Highest Priority)
        if (validH2H) {
            teams.sort((a, b) => {
                const pA = getH2HPct(groupRecs[a.id]);
                const pB = getH2HPct(groupRecs[b.id]);
                return pB - pA;
            });
        }

        return teams;
    }

    checkSweep(groupRecs, numTeams) {
        // Sweep check: A sweep is applicable if one club has defeated all others (wins = N-1)
        // OR if one club has lost to all others (losses = N-1).
        // If sweep applies, we can break the tie (at least partially).
        // For valid sorting in JS, if we can identify a sweeper, they go to top.
        // If we identify a swept, they go to bottom.
        // BUT strict NFL rule: "If head-to-head sweep is not applicable, skip to next step."
        // Meaning if there's NO sweep, we ignore H2H entirely.

        let hasSweeper = false;
        let hasSwept = false;

        Object.values(groupRecs).forEach(r => {
            // Note: In Sim, teams might play 2 games vs div opponent.
            // So "Sweep" means winning ALL games played probably? 
            // NFL Step 1 for Wild Card: "Head-to-head sweep. (Applicable only if one club has defeated each of the others or if one club has lost to each of the others.)"
            // It implies "Defeated each of the others" -> at least 1 win vs ALL distinct opponents?
            // Simpler proxy: Win Pct 1.0 or 0.0 with games played vs all?
            // Let's stick to "validH2H" flag if any team meets condition.

            if (r.w > 0 && r.l === 0) hasSweeper = true;
            if (r.l > 0 && r.w === 0) hasSwept = true;
        });

        return hasSweeper || hasSwept;
    }

    breakHeadsUpH2H(teams, runH2H) {
        // Simple 2-team tie
        const id1 = teams[0].id;
        const id2 = teams[1].id;
        const wins1 = this.h2hMatrix[`${id1}-${id2}`] || 0;
        const wins2 = this.h2hMatrix[`${id2}-${id1}`] || 0;

        if (wins1 > wins2) return [teams[0], teams[1]];
        if (wins2 > wins1) return [teams[1], teams[0]];

        // If tied H2H, check Conf
        const cp1 = this.getStatPct(teams[0], 'confRecord');
        const cp2 = this.getStatPct(teams[1], 'confRecord');
        if (cp1 !== cp2) return cp1 > cp2 ? [teams[0], teams[1]] : [teams[1], teams[0]];

        return teams; // Still tied
    }

    iterativeWildCardSort(wildCards) {
        const sorted = [];
        let pool = [...wildCards];

        while (pool.length > 0) {
            // 1. Group by Division
            const byDiv = {};
            pool.forEach(t => {
                if (!byDiv[t.division]) byDiv[t.division] = [];
                byDiv[t.division].push(t);
            });

            // 2. Reduce each division to ONE representative (highest ranked in div)
            const representatives = [];
            for (const div in byDiv) {
                // Sort this division's candidates using Division Rules
                const divTeams = byDiv[div];
                divTeams.sort((a, b) => this.getWinPct(b) - this.getWinPct(a));
                const ranked = this.resolveTies(divTeams, null, 'division');
                representatives.push(ranked[0]); // Push the best one

                // DEBUG: Trace Division Rep Logic
                if (div === 'NFC West' && ranked.length > 1) {
                    console.log(`[WC Debug] NFC West Rep: ${ranked[0].abbr} (Candidates: ${ranked.map(t => t.abbr)})`);
                }
            }

            // 3. Sort the Representatives using Conference Rules (Wild Card)
            representatives.sort((a, b) => this.getWinPct(b) - this.getWinPct(a));
            const rankedReps = this.resolveTies(representatives, null, 'conference'); // Uses strict sweep check

            // 4. The winner is the next Wild Card Seed
            const winner = rankedReps[0];
            sorted.push(winner);

            // DEBUG
            if (winner.id == 25 || winner.id == 14) {
                console.log(`[WC Debug] Winner picked: ${winner.abbr}`);
            }

            // 5. Remove winner from pool and repeat

            // 5. Remove winner from pool and repeat
            pool = pool.filter(t => t.id !== winner.id);
        }
        return sorted;
    }

    getH2HPct(rec) {
        if (!rec) return 0;
        const total = rec.w + rec.l; // Matches within group
        if (total === 0) return 0;
        return rec.w / total;
    }

    getStatPct(team, field) {
        const rec = team[field];
        if (!rec) return 0;
        const tot = rec.wins + rec.losses + rec.ties;
        if (tot === 0) return 0;
        return (rec.wins + 0.5 * rec.ties) / tot;
    }

    recordSeed(results, teamId, seed) {
        results[teamId].madePlayoffs++;
        if (seed === 1) results[teamId].seed1++;
        if (seed === 2) results[teamId].seed2++;
        if (seed === 3) results[teamId].seed3++;
        if (seed === 4) results[teamId].seed4++;
        if (seed === 5) results[teamId].seed5++;
        if (seed === 6) results[teamId].seed6++;
        if (seed === 7) results[teamId].seed7++;
    }

    compareTeams(a, b) {
        // 1. Win Pct
        const aWP = this.getWinPct(a);
        const bWP = this.getWinPct(b);
        if (aWP !== bWP) return bWP - aWP; // Descending

        // 2. Division Record (if same division) - approximated generally because checking "same div" is strictly for div tiebreak
        // But for global sort, we skip unique div logic and go to Conf logic or Coin Flip generally.
        // Let's implement a simple "DivWins likely higher better" if we had it populated?
        // We do populate divRecord in sim.

        // 3. Random Coin Flip for tiebreaker (Simulates complex deep tiebreakers)
        // Since this compare is dependent on order, we need stability? 
        // For Monte Carlo, random is actually GOOD. It reflects the uncertainty of deep tiebreakers.
        return Math.random() - 0.5;
    }

    applyCommonGamesSort(teams) {
        // Find common opponents for the GROUP
        // 1. Get all opponents for each team
        const teamOpps = {};
        teams.forEach(t => {
            teamOpps[t.id] = this.getOpponents(t.id);
        });

        // 2. Intersect
        let intersection = null;
        Object.values(teamOpps).forEach(opps => {
            if (intersection === null) intersection = opps;
            else intersection = intersection.filter(x => opps.includes(x));
        });

        if (!intersection || intersection.length < 4) {
            console.log(`[CommonGames Debug] Inapplicable (Count: ${intersection ? intersection.length : 0}) for ${teams.map(t => t.abbr)}`);
            return;
        }

        console.log(`[CommonGames Debug] Applicable (Count: ${intersection.length}) for ${teams.map(t => t.abbr)}`);

        // 3. Calculate Win Pct vs Common
        teams.forEach(t => {
            t._commonPct = this.calculateCommonPct(t.id, intersection);
        });

        teams.sort((a, b) => b._commonPct - a._commonPct);
        console.log(`[CommonGames Debug] Sorted: ${teams.map(t => `${t.abbr}(${t._commonPct.toFixed(3)})`)}`);
    }

    getOpponents(tid) {
        const opps = [];
        this.completedGames.forEach(g => {
            if (g.homeId === tid) opps.push(g.awayId);
            if (g.awayId === tid) opps.push(g.homeId);
        });
        return opps;
    }

    calculateCommonPct(tid, commonIds) {
        let w = 0, l = 0, t = 0;
        this.completedGames.forEach(g => {
            if (g.homeId === tid && commonIds.includes(g.awayId)) {
                if (g.homeScore > g.awayScore) w++;
                else if (g.awayScore > g.homeScore) l++;
                else t++;
            }
            if (g.awayId === tid && commonIds.includes(g.homeId)) {
                if (g.awayScore > g.homeScore) w++;
                else if (g.homeScore > g.awayScore) l++;
                else t++;
            }
        });
        const tot = w + l + t;
        return tot === 0 ? 0 : (w + 0.5 * t) / tot;
    }

    calculateSOV(team) {
        const defeated = [];
        this.completedGames.forEach(g => {
            if (g.homeId === team.id && g.homeScore > g.awayScore) defeated.push(g.awayId);
            if (g.awayId === team.id && g.awayScore > g.homeScore) defeated.push(g.homeId);
        });

        if (defeated.length === 0) return 0;

        let wins = 0, total = 0;
        defeated.forEach(oppId => {
            const opp = this.teams[oppId]; // Global lookup
            if (opp) {
                wins += opp.record.wins + 0.5 * opp.record.ties;
                total += opp.record.wins + opp.record.losses + opp.record.ties;
            }
        });

        return total === 0 ? 0 : wins / total;
    }
}
