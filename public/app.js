
// app.js

let GLOBAL_DATA = {
    teams: {},
    schedule: []
};
let CURRENT_VIEW = 'league';
let CURRENT_SORT = { field: 'playoff', dir: 'desc' };
let USER_OVERRIDES = JSON.parse(localStorage.getItem('nfl_overrides') || '{}');
let USER_ARROWS = JSON.parse(localStorage.getItem('nfl_arrows') || '{}');

document.addEventListener('DOMContentLoaded', async () => {
    await fetchData();
    await fetchData();
    renderView(CURRENT_VIEW);

    // Auto-refresh data every 5 minutes
    setInterval(async () => {
        // Only auto-refresh if no local picking activity is happening or if user is idle
        // But usually, refreshing data is safe as long as we don't clear overrides.
        await fetchData(true); // silent = true
    }, 300000);
});

async function fetchData(silent = false) {
    if (!silent) showLoading(true);
    try {
        const res = await fetch('/api/data');
        const data = await res.json();
        GLOBAL_DATA = { ...GLOBAL_DATA, ...data };
        console.log("Data loaded:", Object.keys(data.teams).length, "teams");

        await runSimulation(silent);

    } catch (e) {
        console.error("Fetch Error:", e);
    } finally {
        if (!silent) showLoading(false);
    }
}

async function runSimulation(silent = false) {
    console.log("Running Simulation...");
    const btn = document.getElementById('btn-sim');
    if (!silent && btn) {
        btn.disabled = true;
        btn.textContent = 'Simulating...';
    }

    // Build overrides from USER_ARROWS (map gameId -> string outcome?)
    // Actually server expects { [teamId]: 'win'/'loss' } or { [gameId]: 'home'/'away' }?
    // Simulator.js `run` expects { [teamId]: 'win' ... }.
    // We need to map gameId winner to teamId status.
    // Actually, simulator.js logic around lines 71+ handles specific game IDs if we pass them correctly?
    // Looking at simulator.js:
    // It maps teamId -> nextGameId. 
    // It iterates `userOverrides` keys. If key is teamId, it checks next game.
    // So we should format overrides as { [WinnerTeamId]: 'win' }. 
    // If we pick a winner, that team 'wins'. The loser 'loses' implicitly.

    // Build overrides
    // 1. Regular Season (Team-based): { [teamId]: 'win'|'loss' }
    // 2. Playoff (Matchup-based): { [ABBR-ABBR]: winnerId }

    const overrides = { ...USER_OVERRIDES };

    // Add Bracket Picks
    Object.keys(USER_ARROWS).forEach(matchupKey => {
        overrides[matchupKey] = USER_ARROWS[matchupKey];
    });
    localStorage.setItem('nfl_overrides', JSON.stringify(USER_OVERRIDES));
    localStorage.setItem('nfl_arrows', JSON.stringify(USER_ARROWS));
    console.log("Overrides saved to localStorage. Sent to simulation:", overrides);

    try {
        const res = await fetch('/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ overrides })
        });
        const data = await res.json();

        // Data format: { teams: {...}, games: {...}, matchups: {...} }
        GLOBAL_DATA.simResults = data.teams;
        if (data.games) GLOBAL_DATA.gameStats = data.games;
        GLOBAL_DATA.matchups = data.matchups; // Store dynamic matchups

        // Update Teams with Sim Data (Crucial for Bracket Advancement)
        if (GLOBAL_DATA.teams && GLOBAL_DATA.simResults) {
            Object.values(GLOBAL_DATA.teams).forEach(t => {
                t.simData = GLOBAL_DATA.simResults[t.id];
            });
        }

        renderMainTable();
        renderInteractiveBracket(); // Update bracket view if visible
    } catch (e) {
        console.error("Simulation failed:", e);
    } finally {
        if (btn) btn.disabled = false;
        if (btn) btn.textContent = 'Run Simulation';
    }
}

function showLoading(show) {
    const el = document.getElementById('loading-indicator');
    if (el) el.style.display = show ? 'flex' : 'none';
}

window.renderView = function (viewType) {
    CURRENT_VIEW = viewType;

    // Update Tab Styles
    document.querySelectorAll('.table-tab-btn').forEach(btn => {
        if (btn.innerText.toLowerCase() === viewType) btn.classList.add('active');
        else if (viewType === 'playoffs' && btn.innerText === 'Playoffs') btn.classList.add('active'); // fuzzy match
        else btn.classList.remove('active');
    });

    const container = document.getElementById('view-container');
    container.innerHTML = '';

    if (viewType === 'playoffs') {
        container.innerHTML = '<div id="bracket-container"></div>';
        renderInteractiveBracket();
    } else {
        renderTable(container, viewType);
    }
}


// Story removal: Article rendering and back functions removed

// Handle Browser Back Button
window.addEventListener('popstate', (event) => {
    handleRouting();
});

function handleRouting() {
    renderView('league');
}


function formatGroupTitle(title) {
    const afcUrl = "https://a.espncdn.com/i/teamlogos/nfl/500/afc.png";
    const nfcUrl = "https://a.espncdn.com/i/teamlogos/nfl/500/nfc.png";

    if (title.startsWith("AFC")) {
        return `<img src="${afcUrl}" class="conf-logo-inline"> ${title.replace("AFC", "").trim()}`;
    }
    if (title.startsWith("NFC")) {
        return `<img src="${nfcUrl}" class="conf-logo-inline"> ${title.replace("NFC", "").trim()}`;
    }
    return title;
}

function renderTable(container, filter) {
    const table = document.createElement('table');
    table.id = 'odds-table';

    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th class="col-team" onclick="changeSort('team')">Team ${getSortArrow('team')}</th>
            <th class="col-record" onclick="changeSort('record')">Record ${getSortArrow('record')}</th>
            <th class="col-confdiv" style="text-align: center;">Conf/Div</th>
            <th class="col-playoff" onclick="changeSort('playoff')">
                <span class="full-name">Playoffs</span><span class="abbr-name">PO</span>
                ${getSortArrow('playoff')}
            </th>
            <th class="col-division" onclick="changeSort('div')">
                <span class="full-name">Divisional</span><span class="abbr-name">DIV</span>
                ${getSortArrow('div')}
            </th>
            <th class="col-seed1" onclick="changeSort('conf')">
                <span class="full-name">Conference</span><span class="abbr-name">CONF</span>
                ${getSortArrow('conf')}
            </th>
            <th class="col-sb-app" onclick="changeSort('sb_app')">
                <span class="full-name">Super Bowl</span><span class="abbr-name">SB</span>
                ${getSortArrow('sb_app')}
            </th>
            <th class="col-sb-win" onclick="changeSort('sb')">
                <span class="full-name">Champ</span><span class="abbr-name">CHAMP</span>
                ${getSortArrow('sb')}
            </th>
        </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    // Sort Teams
    const sortedTeams = getSortedTeams(Object.values(GLOBAL_DATA.teams), filter);

    // Pre-calculate Next Game Map
    const nextGameMap = {};
    GLOBAL_DATA.schedule.forEach(g => {
        if (!g.completed) {
            nextGameMap[g.homeId] = true;
            nextGameMap[g.awayId] = true;
        }
    });

    sortedTeams.forEach(team => {
        const tr = document.createElement('tr');

        // Defaults
        const sim = team.simData || { madePlayoffs: 0, madeDivisional: 0, madeConference: 0, madeSuperBowl: 0, wonSuperBowl: 0 };
        const total = sim.totalSims || 1;

        // Map Cols
        const pWC = (sim.madePlayoffs / total * 100).toFixed(1);
        const pDiv = (sim.madeDivisional / total * 100).toFixed(1);
        const pConf = (sim.madeConference / total * 100).toFixed(1);
        const pSBApp = (sim.madeSuperBowl / total * 100).toFixed(1);
        const pSBWin = (sim.wonSuperBowl / total * 100).toFixed(1);

        // Colors ...
        const cellColor = (val) => {
            const v = parseFloat(val);
            if (v >= 99.9) return `background-color: #2c5282; color: white;`;
            if (v <= 0.1) return `background-color: white; color: #ccc;`;
            const alpha = v / 100;
            return `background-color: rgba(66, 153, 225, ${alpha}); color: ${v > 50 ? 'white' : 'black'};`;
        };

        tr.innerHTML = `
            <td class="team-cell col-team">
                <div class="team-info">
                    <img src="${team.logo}" class="team-logo" alt="">
                    <span class="team-name full-name">${team.name}</span>
                    <span class="team-name abbr-name">${team.abbr}</span>
                </div>
            </td>
            <td class="col-record">${team.record.wins}-${team.record.losses}-${team.record.ties}</td>
            <td class="col-confdiv" style="text-align: center;">
                <div class="conf-badge-inline">
                    <img src="${team.conference === 'AFC' ? 'https://a.espncdn.com/i/teamlogos/nfl/500/afc.png' : 'https://a.espncdn.com/i/teamlogos/nfl/500/nfc.png'}" class="conf-icon-sm">
                    <span class="conf-name full-name">${team.conference} ${team.division.replace('AFC ', '').replace('NFC ', '')}</span>
                    <span class="conf-name abbr-name">${team.conference.charAt(0)}${team.division.replace('AFC ', '').replace('NFC ', '').charAt(0)}</span>
                </div>
            </td>
            
            <td class="heatmap-cell col-playoff" style="${cellColor(pWC)}">${pWC}%</td>
            <td class="heatmap-cell col-division" style="${cellColor(pDiv)}">${pDiv}%</td>
            <td class="heatmap-cell col-seed1" style="${cellColor(pConf)}">${pConf}%</td>
            <td class="heatmap-cell col-sb-app" style="${cellColor(pSBApp)}">${pSBApp}%</td>
            <td class="heatmap-cell col-sb-win" style="${cellColor(pSBWin)}">${pSBWin}%</td>
        `;

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);

    const wrapper = document.createElement('div');
    wrapper.className = 'table-container';
    wrapper.appendChild(table);
    container.appendChild(wrapper);
}

// ...

function getSortedTeams(teams, filter) {
    const getWinPct = (t) => {
        const tot = t.record.wins + t.record.losses + t.record.ties;
        return tot === 0 ? 0 : (t.record.wins + 0.5 * t.record.ties) / tot;
    };

    return [...teams].sort((a, b) => {
        // 1. Grouping Sort (Highest Priority)
        if (filter === 'conf') {
            if (a.conference !== b.conference) return a.conference.localeCompare(b.conference);
        } else if (filter === 'div') {
            if (a.division !== b.division) return a.division.localeCompare(b.division);
        }

        // 2. User/Feature Sort
        let valA, valB;
        const simA = a.simData || { madePlayoffs: 0, madeDivisional: 0, madeConference: 0, wonSuperBowl: 0 };
        const simB = b.simData || { madePlayoffs: 0, madeDivisional: 0, madeConference: 0, wonSuperBowl: 0 };
        const totalA = simA.totalSims || 1;
        const totalB = simB.totalSims || 1;

        if (CURRENT_SORT.field === 'team') {
            valA = a.name; valB = b.name;
            return CURRENT_SORT.dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        switch (CURRENT_SORT.field) {
            case 'record':
                valA = getWinPct(a); valB = getWinPct(b);
                break;
            case 'playoff':
                valA = simA.madePlayoffs / totalA; valB = simB.madePlayoffs / totalB;
                break;
            case 'div':
                valA = simA.madeDivisional / totalA; valB = simB.madeDivisional / totalB;
                break;
            case 'conf':
                valA = simA.madeConference / totalA; valB = simB.madeConference / totalB;
                break;
            case 'sb_app':
                valA = simA.madeSuperBowl / totalA; valB = simB.madeSuperBowl / totalB;
                break;
            case 'sb':
                valA = simA.wonSuperBowl / totalA; valB = simB.wonSuperBowl / totalB;
                break;
            default:
                valA = getWinPct(a); valB = getWinPct(b);
        }

        if (Math.abs(valA - valB) > 0.0001) {
            return CURRENT_SORT.dir === 'asc' ? valA - valB : valB - valA;
        }

        // 3. Fallback Tiebreaker
        return b.record.wins - a.record.wins;
    });
}

function changeSort(field) {
    if (CURRENT_SORT.field === field) {
        CURRENT_SORT.dir = CURRENT_SORT.dir === 'desc' ? 'asc' : 'desc';
    } else {
        CURRENT_SORT.field = field;
        CURRENT_SORT.dir = 'desc';
    }
    renderView(CURRENT_VIEW);
}

function getSortArrow(field) {
    if (CURRENT_SORT.field !== field) return '<span style="opacity:0.2">↕</span>';
    return CURRENT_SORT.dir === 'desc' ? '↓' : '↑';
}

function isSel(tid, act) {
    return USER_OVERRIDES[tid] === act ? `active ${act}` : '';
}

// Interactive Bracket State
// Initialized from localStorage at top of file

async function previewMatchup(homeId, awayId) {
    const modal = document.getElementById('preview-modal');
    const content = document.getElementById('preview-content');

    content.innerHTML = '<div class="text-center p-4">Loading stats...</div>';
    modal.style.display = 'flex';

    try {
        const [homeStats, awayStats] = await Promise.all([
            fetch(`/api/team/${homeId}/stats`).then(r => r.json()),
            fetch(`/api/team/${awayId}/stats`).then(r => r.json())
        ]);

        const hTeam = GLOBAL_DATA.teams[homeId];
        const aTeam = GLOBAL_DATA.teams[awayId];

        const formatVal = (stat) => {
            if (!stat) return 'N/A';
            // stat is { value, displayValue, rank }
            let s = stat.displayValue || 'N/A';
            if (stat.rank) s += ` (#${stat.rank})`;
            return s;
        };

        const getRaw = (stat) => stat ? parseFloat(stat.value) : -1;

        const row = (label, hStat, aStat, lowerBetter = false) => {
            const hVal = formatVal(hStat);
            const aVal = formatVal(aStat);
            const hRaw = getRaw(hStat);
            const aRaw = getRaw(aStat);

            let hBetter = false, aBetter = false;
            if (hRaw !== -1 && aRaw !== -1) {
                if (lowerBetter) {
                    if (hRaw < aRaw) hBetter = true;
                    else if (aRaw < hRaw) aBetter = true;
                } else {
                    if (hRaw > aRaw) hBetter = true;
                    else if (aRaw > hRaw) aBetter = true;
                }
            }

            return `
            <div class="stat-row">
                <div class="stat-val ${aBetter ? 'better' : ''}">${aVal}</div>
                <div class="stat-label">${label}</div>
                <div class="stat-val ${hBetter ? 'better' : ''}">${hVal}</div>
            </div>
            `;
        }


        const prob = getMatchupWinProb(hTeam, aTeam);
        const fav = prob > 50 ? hTeam : aTeam;
        const pct = prob > 50 ? prob : 100 - prob;

        const narrative = `
            <div class="preview-narrative" style="padding: 15px; background: #f7fafc; border-radius: 8px; margin-bottom: 20px; font-size: 14px; line-height: 1.5; color: #2d3748;">
                <p style="margin: 0;">
                    Based on <strong>1000 simulations</strong>, the <strong>${fav.name}</strong> are favored to win with a <strong>${pct}%</strong> probability.
                    ${fav.name}'s offense (Points: ${formatVal(fav.id === hTeam.id ? homeStats.pointsPerGame : awayStats.pointsPerGame)}) 
                    is projected to outpace ${fav.id === hTeam.id ? aTeam.name : hTeam.name}.
                </p>
            </div>
        `;

        content.innerHTML = `
            <div class="preview-header">
                <div class="team-col">
                    <img src="${aTeam.logo}" class="team-logo-lg">
                    <h3>${aTeam.name}</h3>
                </div>
                <div class="vs-col">VS</div>
                <div class="team-col">
                    <img src="${hTeam.logo}" class="team-logo-lg">
                    <h3>${hTeam.name}</h3>
                </div>
            </div>
            ${narrative}
            <div class="stats-grid">
                ${row('Points / Game', homeStats.pointsPerGame, awayStats.pointsPerGame)}
                ${row('Points Allowed', homeStats.scoringDefense, awayStats.scoringDefense, true)}
                ${row('Pass Offense', homeStats.passOffense, awayStats.passOffense)}
                ${row('Pass Defense', homeStats.passDefense, awayStats.passDefense, true)}
                ${row('Rush Offense', homeStats.rushOffense, awayStats.rushOffense)}
                ${row('Rush Defense', homeStats.rushDefense, awayStats.rushDefense, true)}
                ${row('Avg Turnover Margin', homeStats.turnoverDiff, awayStats.turnoverDiff)}
            </div>
            <div class="preview-footer">
                <button onclick="document.getElementById('preview-modal').style.display='none'" class="close-btn">Close</button>
            </div>
        `;

    } catch (e) {
        content.innerHTML = `<div class="error">Error loading stats: ${e.message}</div>`;
    }
}

async function updateSimWithOverride(gameId, winnerId) {
    USER_ARROWS[gameId] = winnerId;
    console.log("User picked:", winnerId, "for game", gameId);

    // Re-run simulation
    await runSimulation();
    // runSimulation() handles updating the view, but we need to ensure it uses USER_ARROWS
    // actually runSimulation calls fetch('/api/simulate', ...)
    // we need to pass overrides there.
}
window.updateSimWithOverride = updateSimWithOverride;

// Modify runSimulation to use overrides
// (This needs to be updated in the existing runSimulation function)

// Helper to calculate match odds (mirrors Simulator logic)
function getMatchupWinProb(p1, p2) {
    // Basic Rating
    const getRat = (t) => {
        const stats = t.stats || { pointsFor: 0, pointsAgainst: 0, gamesPlayed: 1 }; // Fallback
        if (!stats.gamesPlayed) return 0;
        return (stats.pointsFor - stats.pointsAgainst) / stats.gamesPlayed;
    };
    const r1 = getRat(p1);
    const r2 = getRat(p2);
    // Home Advantage not perfectly applicable in neutral site playoff? 
    // Usually higher seed is home.
    // We don't know who is home info in the 'matchup' object easily without seed check.
    // Let's assume Seed logic: Lower seed = Home.
    // If Seeds are 'TBD', assume neutral (0).
    const s1 = parseInt(p1.seed) || 99;
    const s2 = parseInt(p2.seed) || 99;
    const ha = (s1 < s2) ? 2.0 : (s2 < s1) ? -2.0 : 0;

    const spread = r1 - r2 + ha;
    const prob1 = 1 / (1 + Math.pow(10, -(spread / 16)));
    return (prob1 * 100).toFixed(0);
}

function renderInteractiveBracket() {
    const container = document.getElementById('bracket-container');
    if (!container) return;

    if (!GLOBAL_DATA.matchups) {
        container.innerHTML = '<div class="p-4 text-center text-white">Run Simulation to see Bracket</div>';
        return;
    }

    const { WC } = GLOBAL_DATA.matchups;
    const teams = Object.values(GLOBAL_DATA.teams);

    // Simulation Data
    const sampleTeam = GLOBAL_DATA.simResults ? Object.values(GLOBAL_DATA.simResults)[0] : null;
    const totalSims = sampleTeam ? sampleTeam.totalSims : 1000;
    const threshold = totalSims * 0.9;

    // Helper: Sort matches by count (for WC)
    const getSorted = (roundObj) => {
        if (!roundObj) return [];
        return Object.values(roundObj).sort((a, b) => b.count - a.count);
    };

    // --- Wild Card (Fixed 6) ---
    // Use Matchup logic for WC as it's the starting point
    const wcSorted = getSorted(WC).slice(0, 6);
    const wcGames = [...wcSorted];
    while (wcGames.length < 6) wcGames.push({ isTBD: true });

    // --- Dynamic Progression Logic (Team Based) ---
    const getRoundTeams = (conf, prop) => {
        const res = teams.filter(t =>
            t.conference === conf &&
            (t.simData && t.simData[prop] >= threshold)
        ).sort((a, b) => a.seed - b.seed);
        console.log(`[Bracket Debug] ${conf} ${prop} (Thresh: ${threshold}):`, res.map(t => `${t.abbr} (${t.simData[prop]})`));
        return res;
    };

    const buildDivGames = (conf) => {
        const knowns = getRoundTeams(conf, 'madeDivisional');
        // Logic: 
        // Slot 1: Seed 1 (knowns[0]) vs Lowest Remaining.
        // Slot 2: 2nd Highest vs 3rd Highest.
        // If we don't have enough knowns, show TBD.

        let slot1, slot2;

        // Slot 1 (Top Seed vs Lowest)
        // Ideally knowns[0] is Seed 1.
        if (knowns.length > 0 && knowns[0].seed === 1) {
            // Do we have the lowest seed? (Length == 4 implies we have all)
            const p2 = (knowns.length === 4) ? knowns[3] : null; // 4th item is lowest seed
            slot1 = { p1: knowns[0], p2: p2, isPartial: !p2 };
        } else {
            // If Seed 1 isn't even >90% (unlikely), TBD.
            slot1 = { isTBD: true };
        }

        // Slot 2 (2nd vs 3rd)
        // If we have at least 2 teams (Seed 1 + One other), who is the other?
        // If we have 4 teams: Index 1 vs Index 2.
        // If we have 2 or 3 teams: We have Index 1 (Highest non-1). But maybe not their opponent.
        if (knowns.length >= 2) {
            const p1 = knowns[1]; // 2nd Highest known
            const p2 = (knowns.length === 4) ? knowns[2] : null; // 3rd known
            slot1 = slot1.isTBD ? slot1 : slot1; // Keep slot1
            slot2 = { p1: p1, p2: p2, isPartial: !p2 };
        } else {
            slot2 = { isTBD: true };
        }

        return [slot1, slot2];
    };

    const divGames = [...buildDivGames('AFC'), ...buildDivGames('NFC')];

    // --- Conference ---
    const buildConfGame = (conf) => {
        const knowns = getRoundTeams(conf, 'madeConference');
        // Need Top vs Bottom (Higher Seed vs Lower Seed)
        // knowns sorted by seed (asc).
        if (knowns.length >= 2) {
            return { p1: knowns[0], p2: knowns[1] };
        } else if (knowns.length === 1) {
            return { p1: knowns[0], p2: null, isPartial: true };
        }
        return { isTBD: true };
    };
    const confGames = [buildConfGame('AFC'), buildConfGame('NFC')];

    // --- Super Bowl ---
    const afcChamps = getRoundTeams('AFC', 'madeSuperBowl'); // AFC Rep
    const nfcChamps = getRoundTeams('NFC', 'madeSuperBowl'); // NFC Rep

    let sbGameVal = { isTBD: true };
    if (afcChamps.length > 0 && nfcChamps.length > 0) {
        sbGameVal = { p1: afcChamps[0], p2: nfcChamps[0] };
    } else if (afcChamps.length > 0) {
        sbGameVal = { p1: afcChamps[0], p2: null, isPartial: true };
    } else if (nfcChamps.length > 0) {
        sbGameVal = { p1: nfcChamps[0], p2: null, isPartial: true }; // Place NFC in p1 for partial rendering support
        // Wait, renderGame expects p1 vs p2. 
        // If p1 is NFC, just render it "NFC Team vs TBD".
    }
    const sbGame = [sbGameVal];


    const renderGame = (m, roundTitle) => {
        if (m.isTBD) {
            return `
                <div class="bracket-node empty">
                    <div class="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">TBD vs TBD</div>
                    <div class="text-xs text-gray-500">Wait for Results</div>
                </div>
            `;
        }

        const p1 = m.p1;
        const p2 = m.p2;

        // Calculate Probabilities if both exist
        let p1Str = "0%", p2Str = "0%";
        if (p1 && p2) {
            const val = getMatchupWinProb(p1, p2);
            p1Str = val + "%";
            p2Str = (100 - val) + "%";
        }

        const renderTeamNode = (team, isPicked, prob) => {
            return `
                <label class="node-team ${isPicked ? 'picked' : ''} cursor-pointer">
                    <div class="flex items-center gap-2">
                         <input type="radio" name="${m.sortedId || 'partial'}" 
                                value="${team.id}" 
                                ${isPicked ? 'checked' : ''}
                                onclick="${m.sortedId ? `updateSimWithOverride('${m.sortedId}', '${team.id}')` : ''}">
                         <img src="${team.logo}" class="node-logo"> 
                         <div class="flex flex-col leading-tight">
                            <div class="flex items-center gap-1">
                                <span class="text-xs text-gray-400 font-mono">${team.seed || ''}</span>
                                <span class="font-bold text-sm text-black" style="font-size: 13px;">${team.nickname || team.name}</span>
                            </div>
                         </div>
                    </div>
                    <span class="prob-text">${prob}</span>
                </label>
             `;
        };

        // Partial (Team vs TBD)
        if (m.isPartial && p1) {
            return `
                <div class="bracket-node">
                    ${renderTeamNode(p1, true, "ADV")}
                    <div class="node-vs">vs</div>
                    <div class="node-team opacity-50 border-dashed border border-gray-300 justify-center">
                        <span class="text-xs font-bold text-gray-400">TBD</span>
                    </div>
                </div>
            `;
        }

        // Full Matchup
        m.sortedId = [p1.abbr, p2.abbr].sort().join('-');

        const pickedId = USER_ARROWS[m.sortedId];

        return `
            <div class="bracket-node">
                ${renderTeamNode(p1, pickedId === p1.id, p1Str)}
                <div class="node-vs">vs</div>
                ${renderTeamNode(p2, pickedId === p2.id, p2Str)}
                <button class="preview-btn-sm" onclick="previewMatchup('${p1.id}', '${p2.id}')">Preview</button>
            </div>
        `;
    };

    const renderColumn = (title, games) => `
        <div class="round-col">
            <div class="round-header">${title}</div>
            <div class="matchup-col-list">
                ${games.length ? games.map(m => renderGame(m, title)).join('') : '<div class="spacer"></div>'}
            </div>
        </div>
    `;

    container.innerHTML = `
       <div class="bracket-wrapper-inter">
           ${renderColumn('Wild Card', wcGames)}
           ${renderColumn('Divisional', divGames)}
           ${renderColumn('Conference', confGames)}
           ${renderColumn('Super Bowl', sbGame)}
       </div>
   `;
}

// Restore missing functions
function renderMainTable() {
    // Only render table if NOT in playoffs view
    if (CURRENT_VIEW === 'playoffs') return;

    const container = document.getElementById('view-container');
    if (container) renderTable(container, CURRENT_VIEW);
}

function renderScoreboard() {
    const container = document.getElementById('ticker-container');
    if (!container) return;
    container.innerHTML = '';
}

