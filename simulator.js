
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
                madePlayoffs: 0,
                wonDivision: 0,
                seed1: 0,
                seed2: 0,
                seed3: 0,
                seed4: 0, // Div winners
                seed5: 0,
                seed6: 0,
                seed7: 0,
                totalSims: 0
            };
        });

        const start = performance.now();

        // 1. Pre-process games based on overrides
        // We create a "Scenario" games list where some games are already fixed.
        // And we update the "Base Standings" for the simulation start.

        let simBaseTeams = JSON.parse(JSON.stringify(this.teams));
        let simGames = []; // Games that still need to be simulated (randomly)

        for (const game of this.games) {
            const homeSel = userOverrides[game.homeId];
            const awaySel = userOverrides[game.awayId];

            let fixedWinner = null; // 'home', 'away', 'tie', or null (random)

            // Logic for overrides
            // If Home is set to 'win' -> Home Win
            // If Home is set to 'loss' -> Away Win
            // If Home is 'out' -> Home Win

            // Conflict resolution: if both say 'win', treat as toss up? Or prioritize user?
            // Let's assume user is consistent or last click wins.
            // Actually, we process a prioritized hierarchy or just simple logic.

            if (homeSel === 'win' || homeSel === 'out') fixedWinner = 'home';
            if (homeSel === 'loss') fixedWinner = 'away';
            if (homeSel === 'tie') fixedWinner = 'tie';

            // Away overrides might overwrite Home (if user clicked Away Win last? We don't know order)
            // But let's check:
            if (awaySel === 'win' || awaySel === 'out') {
                if (fixedWinner === 'home') fixedWinner = null; // Conflict -> Random?
                else fixedWinner = 'away';
            }
            if (awaySel === 'loss') {
                if (fixedWinner === 'away') fixedWinner = null;
                else fixedWinner = 'home';
            }
            if (awaySel === 'tie') fixedWinner = 'tie';

            // Next Game Logic: User only sets ONE "Next Result", not "Win Out" usually.
            // BUT user requested "Win Out" option.
            // If "Win Out" is selected, it applies to ALL future games for that team.

            // NOTE: The previous UI had "Win/Loss" for *Next Game*. 
            // V2 Request: "replace out with tie" -> Actually user said "replace out with tie" but also "option for win out".
            // Wait, "add option for win out" was in original prompt. V2 request says "replace the out option with tie".
            // So maybe we drop Win Out? Or have Win / Loss / Tie.
            // Let's support: Win (Next), Loss (Next), Tie (Next).
            // Win Out might be dropped based on "replace the out option with tie".
            // I will stick to Win/Loss/Tie for specific next game, or maybe global.
            // Actually, usually these simulators allow picking ANY game. 
            // For this UI, we only have row buttons. So it implies "Next Game".

            // Handling "Next Game" specifically:
            // We need to know if this is the "Next Game" for these teams.
            // We'll iterate games chronologically. If it's the first unplayed game for a team with an override, apply it.

            // To do this correctly: SimGames needs to differentiate "Fully fixed" vs "Play it".
            // But for efficiency, if fixed, we just update simBaseTeams stats and don't put it in simGames loop.

            // Let's allow global override for now: if userOverride[id] is set, we try to apply it to *applicable* games.
            // Since buttons are on rows, we treat it as "Next Game Only" or "All"? 
            // V1 was "Next Game". V2 says "replace out with tie".
            // So Win / Loss / Tie for Next Game.

            // How to identify Next Game? 
            // We can sort games by id (proxy for time) or find lowest week.
            // Assuming `this.games` is sorted-ish.

            // Let's just create a quick map of "Games to Fix"
            // If userOverrides[teamId] is set, we fix their *earliest* game.

        }

        // Better approach for overrides in Monte Carlo:
        // We handle overrides inside the loop? No, that's slow.
        // We apply overrides ONCE to the `simBaseTeams` and remove those games from `simGames`.

        // 1. Identify "Next Games" for teams with overrides
        const teamNextGameId = {}; // teamId -> gameId
        // Find next game for each team
        for (const game of this.games) {
            if (!teamNextGameId[game.homeId]) teamNextGameId[game.homeId] = game.id;
            if (!teamNextGameId[game.awayId]) teamNextGameId[game.awayId] = game.id;
        }

        const fixedGames = {}; // gameId -> 'home' | 'away' | 'tie'

        for (const [teamId, action] of Object.entries(userOverrides)) {
            if (action === 'none') continue;

            const gId = teamNextGameId[teamId];
            if (!gId) continue; // No games left

            const game = this.games.find(g => g.id === gId);
            if (!game) continue; // Should not happen

            // Determine outcome
            let outcome = null;
            if (teamId === game.homeId) {
                if (action === 'win') outcome = 'home';
                if (action === 'loss') outcome = 'away';
                if (action === 'tie') outcome = 'tie';
            } else {
                if (action === 'win') outcome = 'away';
                if (action === 'loss') outcome = 'home';
                if (action === 'tie') outcome = 'tie';
            }

            if (outcome) fixedGames[gId] = outcome;
        }

        // Apply fixed games to SimBase
        const gamesToSimulate = [];

        for (const game of this.games) {
            if (fixedGames[game.id]) {
                const outcome = fixedGames[game.id];
                this.updateStandings(simBaseTeams, game.homeId, game.awayId, outcome);
            } else {
                gamesToSimulate.push(game);
            }
        }

        // 2. Run Iterations
        for (let i = 0; i < this.ITERATIONS; i++) {
            // Clone teams from the "Post-Overrides" Base
            // Using a lighter clone if possible, but JSON parse/stringify is robust for deep structure
            // Performance trick: strict structure array?
            // For 32 teams it's fast enough.
            const runTeams = JSON.parse(JSON.stringify(simBaseTeams));

            // Sim remaining games
            for (const game of gamesToSimulate) {
                const homeT = runTeams[game.homeId];
                const awayT = runTeams[game.awayId];

                if (!homeT || !awayT) continue; // Safety skip

                // Dynamic Rating-Based Probability using Live Stats
                // Rating = (PF - PA) / GamesPlayed  (Simple Margin of Victory Model)
                // If gamesPlayed is low (e.g. 0), use 0 rating (average)

                const getLiveRating = (t) => {
                    // Start with weighted baseline if needed, or pure live?
                    // Pure live needs a few games to stabilize.
                    // Fallback to 0 if no games.
                    if (!t.stats || t.stats.gamesPlayed === 0) return 0;
                    return (t.stats.pointsFor - t.stats.pointsAgainst) / t.stats.gamesPlayed;
                };

                const rHome = getLiveRating(homeT);
                const rAway = getLiveRating(awayT);

                // Debug log for first few sims
                // if (Math.random() < 0.001) console.log(`Sim Debug: ${homeT.abbr} (${rHome.toFixed(2)}) vs ${awayT.abbr} (${rAway.toFixed(2)}) -> Prob: ${probHome.toFixed(2)}`);

                // Diff = Home - Away + HomeAdv
                // Rating is "Points better than average opponent" roughly
                const spread = rHome - rAway + HOME_ADVANTAGE;

                // Logistic Function for Win Probability
                // P = 1 / (1 + 10^(-Spread / K))

                const probHome = 1 / (1 + Math.pow(10, -(spread / 16)));

                // Check if prob is NaN
                if (isNaN(probHome)) {
                    // console.error(`NaN Prob: spread=${spread} rHome=${rHome} rAway=${rAway}`);
                    continue;
                }

                // Run Sim
                const r = Math.random();
                let result = 'tie';

                const tieProb = 0.003;

                if (r < probHome - (tieProb / 2)) result = 'home';
                else if (r > probHome + (tieProb / 2)) result = 'away';
                else result = 'tie';

                this.updateStandings(runTeams, game.homeId, game.awayId, result);
            }

            // 3. Determine Playoff Seeds for this iteration
            this.processPlayoffSeeds(runTeams, results);
        }

        // Set totalSims for all (since we ran ITERATIONS)
        Object.keys(results).forEach(id => {
            results[id].totalSims = this.ITERATIONS;
        });

        // Debug output
        // console.log("Sim Done. Results sample:", results[Object.keys(results)[0]]);

        const end = performance.now();
        console.log(`Simulation x${this.ITERATIONS} took ${(end - start).toFixed(2)} ms`);

        return results;
    }

    getWinPct(team) {
        const total = team.record.wins + team.record.losses + team.record.ties;
        if (total === 0) return 0.5;
        return (team.record.wins + (team.record.ties * 0.5)) / total;
    }

    updateStandings(teams, homeId, awayId, result) {
        // Need to simulate a score to update PF/PA?
        // For pure W/L tracking, we don't strictly *need* to update PF/PA for the *ranking* unless we use Margin of Victory in tiebreakers.
        // BUT if we want "Momentum" or "Updated Ratings" during the season sim?
        // Usually Monte Carlo keeps rating static or simple.
        // Let's keep ratings static for the simulation run to avoid feedback loops unless desired.
        // However, we MUST track W/L for standings.
        // And records.

        // Simulating score for stats?
        // Let's just track W/L/T for the records sorting.
        // If we wanted to go deep, we'd generate a score like 24-20 using the spread.
        // For now, simpler is faster.

        teams[homeId].stats.gamesPlayed++;
        teams[awayId].stats.gamesPlayed++;

        if (result === 'home') {
            teams[homeId].record.wins++;
            teams[awayId].record.losses++;
            // Update Div/Conf if applicable (simplified: assume we track it strictly or approx)
            if (teams[homeId].division === teams[awayId].division) {
                teams[homeId].divRecord.wins++;
                teams[awayId].divRecord.losses++;
            }
        } else if (result === 'away') {
            teams[awayId].record.wins++;
            teams[homeId].record.losses++;
            if (teams[homeId].division === teams[awayId].division) {
                teams[awayId].divRecord.wins++;
                teams[homeId].divRecord.losses++;
            }
        } else {
            teams[homeId].record.ties++;
            teams[awayId].record.ties++;
            if (teams[homeId].division === teams[awayId].division) {
                teams[homeId].divRecord.ties++;
                teams[awayId].divRecord.ties++;
            }
        }
    }

    processPlayoffSeeds(teams, results) {
        // Separate into AFC/NFC
        const afc = [];
        const nfc = [];

        Object.values(teams).forEach(t => {
            if (t.conference === 'AFC') afc.push(t);
            else if (t.conference === 'NFC') nfc.push(t);
        });

        // H2H tracking for this run is not passed.
        // We accept that limitation for now (using historical + Records).
        this.rankConference(afc, results, null);
        this.rankConference(nfc, results, null);
    }

    rankConference(confTeams, results, runH2H) {
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
            // Sort division
            const dTeams = divisions[divName];
            // Sort primarily by WinPCT, then Break Ties
            // We use a custom sort logic that calls breakTies for equals

            // Strategy: Group by WinPct, then resolve each group
            // Quick sort by Pct descending
            dTeams.sort((a, b) => this.getWinPct(b) - this.getWinPct(a));

            // Resolve ties
            const ranked = this.resolveTies(dTeams, runH2H, 'division');

            const winner = ranked[0];
            divWinners.push(winner);
            results[winner.id].wonDivision++;

            // Rest are wildcards
            for (let i = 1; i < ranked.length; i++) wildCards.push(ranked[i]);
        }

        // Sort Div Winners (Seeds 1-4)
        const rankedWinners = this.resolveTies(divWinners, runH2H, 'conference');
        rankedWinners.forEach((t, idx) => {
            if (t) {
                const seed = idx + 1;
                this.recordSeed(results, t.id, seed);
            }
        });

        // Sort Wildcards (Seeds 5-7)
        // Correct logic: Iterative reduction
        const rankedWildCards = this.iterativeWildCardSort(wildCards);

        // Top 3 wildcards make playoffs
        for (let i = 0; i < 3; i++) {
            if (rankedWildCards[i]) {
                const seed = 4 + 1 + i; // 5, 6, 7
                this.recordSeed(results, rankedWildCards[i].id, seed);
            }
        }
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
