
// app.js

let GLOBAL_DATA = {
    teams: {},
    schedule: []
};
let CURRENT_VIEW = 'league';
let CURRENT_SORT = { field: 'playoff', dir: 'desc' };
let USER_OVERRIDES = {}; // { teamId: 'win'|'loss'|'tie' }

document.addEventListener('DOMContentLoaded', async () => {
    await fetchData();
    renderView(CURRENT_VIEW);
    renderAsideStories();
});

async function fetchData() {
    showLoading(true);
    try {
        const res = await fetch('/api/data');
        const data = await res.json();
        GLOBAL_DATA = data;
        console.log("Data loaded:", Object.keys(data.teams).length, "teams");

        // Initial Simulation Run to get odds?
        // Actually /api/data just returns static data.
        // We probably want to trigger a sim immediately to get probabilities, 
        // OR /api/data should return pre-simulated data if we cache it server side?
        // The Python app ran sim on every request.
        // Let's call /api/simulate with empty overrides to get initial odds.
        await runSimulation({});

    } catch (e) {
        console.error("Fetch Error:", e);
    } finally {
        showLoading(false);
    }
}

async function runSimulation(overrides) {
    showLoading(true);
    try {
        const res = await fetch('/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ overrides })
        });
        const results = await res.json();
        // Merge results into teams
        Object.keys(results).forEach(tid => {
            if (GLOBAL_DATA.teams[tid]) {
                GLOBAL_DATA.teams[tid].simData = results[tid];
            }
        });
        renderView(CURRENT_VIEW);
        renderTicker();
        renderAsideStories();
    } catch (e) {
        console.error("Sim Error:", e);
    } finally {
        showLoading(false);
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
        renderBracket(container);
    } else {
        renderTable(container, viewType);
    }
}

function renderAsideStories() {
    const container = document.getElementById('stories-viewport');
    if (!container) return;

    const stories = [
        {
            id: 'steelers-ravens-week-18',
            title: 'AFC North Champions: Steelers Outlast Ravens 26-24',
            date: 'January 4, 2026',
            category: 'Division Clincher',
            image: '/terrible_towel.png',
            content: `
                <p>The <b>Pittsburgh Steelers</b> are officially the 2025 AFC North Champions following a 26-24 victory over the Baltimore Ravens. The win locks Pittsburgh into the <b>No. 4 seed</b> for the AFC playoffs.</p>
                <p><b>Aaron Rodgers</b> delivered a clutch performance, hitting <b>Calvin Austin</b> for a 26-yard touchdown with just one minute left to play. However, drama ensued when <b>Chris Boswell missed the extra point</b>, leaving Baltimore within field goal range.</p>
                <p>The Ravens' comeback attempt fell short when <b>Tyler Loop</b> missed a 44-yard field goal as time expired, ensuring the AFC North title stays in Pittsburgh.</p>
            `,
            link: '#'
        }
    ];

    container.innerHTML = stories.map(s => `
        <div class="story-card" id="${s.id}" onclick="window.openStory('${s.id}')">
            ${s.image ? `<img src="${s.image}" class="story-image-header">` : ''}
            <div class="story-header">
                <h2>${s.title}</h2>
                <div class="story-meta">${s.category} | ${s.date}</div>
            </div>
            <div class="story-content">
                ${s.content}
            </div>
        </div>
    `).join('');
}

window.openStory = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

function renderTable(container, filter) {
    const table = document.createElement('table');
    table.id = 'odds-table';

    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
        <tr>
            <th class="col-team" onclick="changeSort('team')">Team ${getSortArrow('team')}</th>
            <th class="col-record" onclick="changeSort('record')">Record ${getSortArrow('record')}</th>
            <th class="col-confdiv">Conf/Div</th>
            <th class="col-playoff" onclick="changeSort('playoff')">Playoffs ${getSortArrow('playoff')}</th>
            <th class="col-division" onclick="changeSort('div')">Win Div ${getSortArrow('div')}</th>
            <th class="col-seed1" onclick="changeSort('seed1')">Bye ${getSortArrow('seed1')}</th>
            <th class="col-sb">Super Bowl</th>
            <th class="col-cb">Sim</th>
        </tr>
        </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    // Sort Teams
    const sortedTeams = getSortedTeams(Object.values(GLOBAL_DATA.teams), filter);

    // Pre-calculate Next Game Map
    // We only care if a team has an *unplayed* game (completed: false)
    const nextGameMap = {};
    GLOBAL_DATA.schedule.forEach(g => {
        if (!g.completed) {
            nextGameMap[g.homeId] = true;
            nextGameMap[g.awayId] = true;
        }
    });

    let lastGroup = null;

    sortedTeams.forEach(team => {
        // Dividers
        if (filter === 'conf' && team.conference !== lastGroup) {
            lastGroup = team.conference;
            const r = document.createElement('tr'); r.className = 'group-divider'; r.innerHTML = '<td colspan="8"></td>'; tbody.appendChild(r);
        }
        if (filter === 'div' && team.division !== lastGroup) {
            lastGroup = team.division;
            const r = document.createElement('tr'); r.className = 'group-divider'; r.innerHTML = '<td colspan="8"></td>'; tbody.appendChild(r);
        }

        const tr = document.createElement('tr');

        // Sim Data formatting
        const sim = team.simData || { madePlayoffs: 0, wonDivision: 0, seed1: 0 };
        const total = sim.totalSims || 1;

        const pPlayoff = (sim.madePlayoffs / total * 100).toFixed(1);
        const pDiv = (sim.wonDivision / total * 100).toFixed(1);
        const pSeed1 = (sim.seed1 / total * 100).toFixed(1);

        // Colors
        const cellColor = (val) => {
            const v = parseFloat(val);
            if (v >= 99.9) return `background-color: #2c5282; color: white;`;
            if (v <= 0.1) return `background-color: white; color: #ccc;`;
            const alpha = v / 100;
            return `background-color: rgba(66, 153, 225, ${alpha}); color: ${v > 50 ? 'white' : 'black'};`;
        };

        const hasNextGame = nextGameMap[team.id];

        let actionsHtml = '';
        if (hasNextGame) {
            actionsHtml = `
                 <div class="action-btn-group">
                    <button class="action-btn ${isSel(team.id, 'win')}" onclick="userAction('${team.id}', 'win')">W</button>
                    <button class="action-btn ${isSel(team.id, 'loss')}" onclick="userAction('${team.id}', 'loss')">L</button>
                    <button class="action-btn ${isSel(team.id, 'tie')}" onclick="userAction('${team.id}', 'tie')">T</button>
                 </div>
             `;
        } else {
            actionsHtml = `<span style="color:#cbd5e0; font-size:12px;">Season Complete</span>`;
        }

        tr.innerHTML = `
            <td class="team-cell">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${team.logo}" class="team-logo" alt="">
                    <span>${team.name}</span>
                </div>
            </td>
            <td class="record-cell">${team.record.wins}-${team.record.losses}-${team.record.ties}</td>
             <td class="record-cell" style="text-align: center; color: #555;">${team.conference}<br><span style="font-size:10px">${team.division}</span></td>
            
            <td class="heatmap-cell" style="${cellColor(pPlayoff)}">${pPlayoff}%</td>
            <td class="heatmap-cell" style="${cellColor(pDiv)}">${pDiv}%</td>
            <td class="heatmap-cell" style="${cellColor(pSeed1)}">${pSeed1}%</td>
            <td class="heatmap-cell" style="">-</td>

            <td class="actions-cell">
                 ${actionsHtml}
            </td>
        `;

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
}

function renderBracket(container) {
    // Basic Bracket Rendering Logic (Simplified for verified seeds 1-7)
    // We need to determine the seeds first.
    // Use Sim Data averages or just Sort by Seed Probability?
    // Python version likely showed *Current Standings* seeds.
    // Let's use getSortedTeams with 'seed' logic on the fly or just sort by current record/tiebreaks
    // Logic: Sort AFC and NFC teams by "Projected Seed" (simulated or record).
    // Let's use sim-based probability for "Projected Bracket" ??
    // User expects "Playoff Bracket" -> usually Current Picture.
    // Let's use GLOBAL_DATA.teams sorted by `simData.seed1`... or just use the sort logic.

    // Sort logic from 'sim' sort:
    // Sort logic from 'sim' sort:
    const afcTeams = Object.values(GLOBAL_DATA.teams).filter(t => t.conference === 'AFC');
    const nfcTeams = Object.values(GLOBAL_DATA.teams).filter(t => t.conference === 'NFC');

    // Use Server-Provided Seeds (1-7)
    // The server calculates seeds using the robust tiebreaker engine.

    const getSeed = (list, seedNum) => list.find(t => t.seed === seedNum) || { name: 'TBD', abbr: 'TBD', logo: '', seed: seedNum };

    const afc1 = getSeed(afcTeams, 1);
    const afc2 = getSeed(afcTeams, 2);
    const afc3 = getSeed(afcTeams, 3);
    const afc4 = getSeed(afcTeams, 4);
    const afc5 = getSeed(afcTeams, 5);
    const afc6 = getSeed(afcTeams, 6);
    const afc7 = getSeed(afcTeams, 7);

    const nfc1 = getSeed(nfcTeams, 1);
    const nfc2 = getSeed(nfcTeams, 2);
    const nfc3 = getSeed(nfcTeams, 3);
    const nfc4 = getSeed(nfcTeams, 4);
    const nfc5 = getSeed(nfcTeams, 5);
    const nfc6 = getSeed(nfcTeams, 6);
    const nfc7 = getSeed(nfcTeams, 7);

    const matchBox = (t1, t2, side) => `
        <div class="matchup-pair">
            <div class="team-box ${t1.abbr === 'TBD' ? 'tbd' : ''}">
                <div class="team-logo"><img src="${t1.logo}" onerror="this.style.display='none'"></div>
                <div class="team-info">
                    <div class="team-name">(${t1.seed || '-'}) ${t1.abbr}</div>
                </div>
            </div>
            <div class="team-box ${t2.abbr === 'TBD' ? 'tbd' : ''}">
                <div class="team-logo"><img src="${t2.logo}" onerror="this.style.display='none'"></div>
                <div class="team-info">
                    <div class="team-name">(${t2.seed || '-'}) ${t2.abbr}</div>
                </div>
            </div>
            <div class="matchup-wire-logo">
                <img src="${t1.logo}" class="wire-logo-img">
            </div>
        </div>
    `;

    // HTML Structure based on bracket.css (Vertical Layout)
    container.innerHTML = `
    <div class="bracket-container">
        <div class="bracket-wrapper">
            <!-- AFC Side -->
            <div class="conf-column afc-col">
                <div class="afc-title">AFC</div>
                
                <!-- Wild Card Round -->
                <div class="round-col">
                    <div style="text-align:center; font-weight:700; color:#cbd5e0; margin-bottom:10px;">WILD CARD</div>
                    <div class="matchup-row">
                         <!-- 2 vs 7 -->
                         ${matchBox(afc2, afc7, 'afc')}
                         <!-- 3 vs 6 -->
                         ${matchBox(afc3, afc6, 'afc')}
                         <!-- 4 vs 5 -->
                         ${matchBox(afc4, afc5, 'afc')}
                    </div>
                </div>
            </div>

            <!-- Super Bowl Center -->
            <div class="sb-center">
                <div class="sb-logo-text">SUPER<br>BOWL</div>
                <div class="sb-roman">LIX</div>
                
                <div style="margin-top:40px; text-align:center;">
                    <div style="font-size:12px; color:#a0aec0; margin-bottom:5px;">BYE WEEK</div>
                    <div class="team-box seed-1-box" style="margin-bottom:10px;"><img src="${afc1.logo}" alt="">${afc1.abbr}</div>
                    <div class="team-box seed-1-box"><img src="${nfc1.logo}" alt="">${nfc1.abbr}</div>
                </div>
            </div>

            <!-- NFC Side -->
            <div class="conf-column nfc-col">
                <div class="nfc-title">NFC</div>
                 <div class="round-col">
                    <div style="text-align:center; font-weight:700; color:#cbd5e0; margin-bottom:10px;">WILD CARD</div>
                    <div class="matchup-row">
                         <!-- 2 vs 7 -->
                         ${matchBox(nfc2, nfc7, 'nfc')}
                         <!-- 3 vs 6 -->
                         ${matchBox(nfc3, nfc6, 'nfc')}
                         <!-- 4 vs 5 -->
                         ${matchBox(nfc4, nfc5, 'nfc')}
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
}

function getWinPct(team) {
    const total = team.record.wins + team.record.losses + team.record.ties;
    if (total === 0) return 0.5;
    return (team.record.wins + 0.5 * team.record.ties) / total;
}

window.userAction = function (teamId, action) {
    // Send override and re-sim
    // Toggle logic: if clicking same action, clear it
    if (USER_OVERRIDES[teamId] === action) {
        delete USER_OVERRIDES[teamId];
        action = 'none'; // Tell server to clear
    } else {
        USER_OVERRIDES[teamId] = action;
    }

    const overrides = { ...USER_OVERRIDES };
    runSimulation(overrides);
}

function getSortedTeams(teams, filter) {
    // 1. Filter/Group logic first?
    // Actually, sorting usually overrides grouping unless we are in Group View.
    // In 'conf' view, we MUST group by Conf first.

    return teams.sort((a, b) => {
        // Grouping overrides
        if (filter === 'conf') {
            if (a.conference < b.conference) return -1;
            if (a.conference > b.conference) return 1;
        }
        if (filter === 'div') {
            if (a.division < b.division) return -1;
            if (a.division > b.division) return 1;
        }

        // Feature Sort
        let valA, valB;
        const simA = a.simData || { madePlayoffs: 0, wonDivision: 0, seed1: 0 };
        const simB = b.simData || { madePlayoffs: 0, wonDivision: 0, seed1: 0 };
        const totalA = simA.totalSims || 1;
        const totalB = simB.totalSims || 1;

        switch (CURRENT_SORT.field) {
            case 'team':
                valA = a.name; valB = b.name;
                if (valA < valB) return CURRENT_SORT.dir === 'asc' ? -1 : 1;
                if (valA > valB) return CURRENT_SORT.dir === 'asc' ? 1 : -1;
                return 0;
            case 'record':
                valA = getWinPct(a); valB = getWinPct(b);
                break;
            case 'playoff':
                valA = simA.madePlayoffs / totalA; valB = simB.madePlayoffs / totalB;
                break;
            case 'div':
                valA = simA.wonDivision / totalA; valB = simB.wonDivision / totalB;
                break;
            case 'seed1':
                valA = simA.seed1 / totalA; valB = simB.seed1 / totalB;
                break;
            default:
                valA = getWinPct(a); valB = getWinPct(b);
        }

        if (valA < valB) return CURRENT_SORT.dir === 'asc' ? -1 : 1;
        if (valA > valB) return CURRENT_SORT.dir === 'asc' ? 1 : -1;
        return 0;
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

function renderTicker() {
    const container = document.getElementById('ticker-container');
    if (!container) return;

    let clinched = [];
    let eliminated = [];

    Object.values(GLOBAL_DATA.teams).forEach(t => {
        const sim = t.simData || {};
        const total = sim.totalSims || 1;
        const pPlayoff = (sim.madePlayoffs / total * 100);

        if (pPlayoff >= 99.9) clinched.push(t);
        if (pPlayoff <= 0.1) eliminated.push(t);
    });

    const createTickerContent = () => {
        let itemsHtml = '';
        if (clinched.length > 0) {
            itemsHtml += `<div class="ticker-item"><span class="ticker-label ticker-clinched">CLINCHED:</span>`;
            clinched.forEach(t => {
                itemsHtml += `
                    <div class="ticker-team">
                        <img src="${t.logo}" class="ticker-logo" onerror="this.style.display='none'">
                        <span class="ticker-abbr">${t.abbr}</span>
                    </div>`;
            });
            itemsHtml += `</div>`;
        }

        if (eliminated.length > 0) {
            itemsHtml += `<div class="ticker-item"><span class="ticker-label ticker-eliminated">ELIMINATED:</span>`;
            eliminated.forEach(t => {
                itemsHtml += `
                    <div class="ticker-team">
                        <img src="${t.logo}" class="ticker-logo" onerror="this.style.display='none'">
                        <span class="ticker-abbr">${t.abbr}</span>
                    </div>`;
            });
            itemsHtml += `</div>`;
        }
        return itemsHtml || '<div class="ticker-item">NO CLINCHING UPDATES</div>';
    };

    const tickerContent = createTickerContent();

    // Simple Marquee style - Double the content for seamless wrap
    let html = `
        <div class="news-ticker" onclick="window.openStory('steelers-ravens-week-18')" style="cursor: pointer;">
            <div class="ticker-title">THE WIRE</div>
            <div class="ticker-wrap">
                <div class="ticker-move">
                    ${tickerContent}
                    ${tickerContent}
                </div>
            </div>
        </div>
    `;
    container.innerHTML = html;
}
