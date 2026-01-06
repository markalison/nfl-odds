
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
    } else if (viewType === 'article') {
        // Param passed as global or argument?
        // renderView definition needs update to accept param
        // But ticker calls renderView('article', 'id')
        // arguments[1] works or update signature
        renderArticle(arguments[1]);
    } else {
        renderTable(container, viewType);
    }
}


const STORIES = [
    {
        id: 'coaching-carousel-2026',
        title: 'Coaching Carousel: Fans React to Major Shakeups',
        date: 'January 5, 2026',
        category: 'League News',
        image: '/coaching_carousel.jpg',
        summary: `
                <p>The NFL coaching landscape shifted dramatically today. We analyzed fan sentiment across Reddit threads to gauge the reaction to the dismissals of Morris, Gannon, Stefanski, and Carroll.</p>
                <div style="margin-bottom: 8px; border-left: 3px solid #e53e3e; padding-left: 8px;">
                    <b>Falcons:</b> 95% Approval (Relieved)
                </div>
                <div style="margin-bottom: 8px; border-left: 3px solid #b91c1c; padding-left: 8px;">
                    <b>Cardinals:</b> 85% Approval (Happy)
                </div>
                <div style="margin-bottom: 8px; border-left: 3px solid #cbd5e0; padding-left: 8px;">
                    <b>Raiders:</b> 50% Approval (Respectful)
                </div>
            `,
        fullContent: `
                <div class="article-container">
                    <img src="/coaching_carousel.jpg" style="width:100%; height:auto; border-radius:8px; margin-bottom:20px;">
                    <h1>Coaching Carousel: Fans React to Major Shakeups</h1>
                    <div class="article-meta">By Jerhyn Sports • January 5, 2026</div>
                    <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">
                    
                    <p>The Monday following Week 18 is always a brutal day in the National Football League, but 2026's "Black Monday" has been particularly volatile. With four major organizations deciding to press the reset button, the league landscape has shifted overnight. We took to the team subreddits to gauge the true "Fan Sentiment" for each move.</p>
                    
                    <h3>Atlanta Falcons: Raheem Morris Out</h3>
                    <p><b>Fan Sentiment Score: 95% Approval (Relieved/Happy)</b></p>
                    <p>The reaction from Atlanta has been almost universally positive. After another season of defensive collapses, the fanbase had reached a breaking point. The top comment on the <a href="https://www.reddit.com/r/falcons" target="_blank" style="color: #2563eb; text-decoration: underline;">r/Falcons megathread</a> simply read: <i>"EVERYONE GET IN HERE!!!!!"</i>. Fans are hopeful for an offensive-minded reset.</p>

                    <h3>Arizona Cardinals: Jonathan Gannon Departs</h3>
                    <p><b>Fan Sentiment Score: 85% Approval (Relieved)</b></p>
                    <p>Jonathan Gannon's tenure in the desert ends after a disastrous 9-game losing streak. Cardinals fans on <a href="https://www.reddit.com/r/AZCardinals" target="_blank" style="color: #2563eb; text-decoration: underline;">r/AZCardinals</a> feel vindicated, calling the team's regression "unforgivable." The focus now turns to salvaging Kyler Murray's prime.</p>

                    <h3>Las Vegas Raiders: The Pete Carroll Experiment Ends</h3>
                    <p><b>Fan Sentiment Score: 65% Approval (Respectful/Ready)</b></p>
                    <p>The Pete Carroll era in Las Vegas is officially over. While the legendary coach brought a culture shift, the on-field results (6-11) just weren't enough. On <a href="https://www.reddit.com/r/raiders" target="_blank" style="color: #2563eb; text-decoration: underline;">r/Raiders</a>, the sentiment is respectful but firm: "Love Pete, but we need a long-term answer." The image of him in the Silver & Black will remain iconic, but brief.</p>

                    <h3>Cleveland Browns: Stefanski Fired</h3>
                    <p><b>Fan Sentiment Score: 40% Approval (Angry at Ownership)</b></p>
                    <p>The vitriol in <a href="https://www.reddit.com/r/Browns" target="_blank" style="color: #2563eb; text-decoration: underline;">r/Browns</a> is palpable, but it's aimed at ownership. While Stefanski was let go, fans see this as another symptom of the Jimmy Haslam era's instability. "It doesn't matter who coaches if the owner is the problem," serves as the rallying cry for a frustrated fanbase.</p>
                </div>
            `
    },
    {
        id: 'steelers-ravens-week-18',
        title: 'AFC North Champions: Steelers Outlast Ravens 26-24',
        date: 'January 4, 2026',
        category: 'Division Clincher',
        image: '/terrible_towel.png',
        summary: `
                <p>The <b>Pittsburgh Steelers</b> are AFC North Champions! A 26-yard TD pass from Aaron Rodgers to Calvin Austin sealed the 26-24 win.</p>
                <p>Drama peaked when Chris Boswell missed the extra point, but Baltimore's last-second 44-yard attempt went wide right.</p>
            `,
        fullContent: `
                <div class="article-container">
                    <img src="/terrible_towel.png" style="width:100%; height:300px; object-fit:cover; border-radius:8px; margin-bottom:20px; object-position: center;">
                    <h1>AFC North Champions: Steelers Outlast Ravens</h1>
                    <div class="article-meta">January 4, 2026</div>
                    <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">
                    
                    <p>In a game that will be instantly enshrined in the lore of this bitter rivalry, the <b>Pittsburgh Steelers</b> defeated the <b>Baltimore Ravens</b> 26-24 to capture the 2025 AFC North division title and the conference's No. 4 seed. See the reaction on <a href="https://www.reddit.com/r/steelers" target="_blank" style="color: #2563eb; text-decoration: underline;">r/Steelers</a>.</p>
                    
                    <h3>Rodgers to Austin: The Dagger</h3>
                    <p>With just 1:04 remaining on the clock, <b>Aaron Rodgers</b> fired a strike to <b>Calvin Austin III</b> to put Pittsburgh ahead.</p>

                    <h3>The Missed Point & The Missed Chance</h3>
                    <p><b>Chris Boswell</b> missed the extra point, giving Baltimore a chance. But rookie kicker Tyler Loop's 44-yard attempt sailed broad right, sealing the <a href="https://www.reddit.com/r/ravens" target="_blank" style="color: #2563eb; text-decoration: underline;">r/Ravens</a> fate.</p>
                </div>
            `
    }
];

function renderAsideStories() {
    const container = document.getElementById('stories-viewport');
    if (!container) return;

    container.innerHTML = STORIES.map(s => `
        <div class="story-card" id="${s.id}">
             ${s.image ? `<div onclick="renderArticle('${s.id}')" class="story-link-wrapper"><img src="${s.image}" class="story-image-header"></div>` : ''}
            <div class="story-header">
                <div onclick="renderArticle('${s.id}')" class="story-title-link" style="cursor:pointer;"><h2>${s.title}</h2></div>
                <div class="story-meta">${s.category} | ${s.date}</div>
            </div>
            <div class="story-content">
                ${s.summary}
            </div>
             <div class="story-footer">
                <div onclick="renderArticle('${s.id}')" class="story-read-more" style="cursor:pointer;">Read Full Story &rarr;</div>
            </div>
        </div>
    `).join('');
}

window.renderArticle = function (id) {
    const story = STORIES.find(s => s.id === id);
    if (!story) return;

    // Update URL logic (SPA Routing)
    // Only push state if we aren't already there (avoids duplicate history entries)
    const currentPath = window.location.pathname;
    if (currentPath !== `/article/${id}`) {
        history.pushState({ view: 'article', id: id }, '', `/article/${id}`);
    }

    const container = document.getElementById('view-container');
    document.querySelectorAll('.table-tab-btn').forEach(btn => btn.classList.remove('active'));

    container.innerHTML = `
            <div style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); max-width: 800px; margin: 0 auto;">
                <button onclick="goBackFromArticle()" style="margin-bottom: 20px; cursor: pointer; border: none; background: none; color: #718096; font-weight: 600;">&larr; Back to Odds</button>
                ${story.fullContent}
            </div>
        `;
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.goBackFromArticle = function () {
    // Go back in history if possible, else default to league view
    if (history.state && history.state.view === 'article') {
        history.back();
    } else {
        history.pushState(null, '', '/');
        renderView('league');
    }
}

// Handle Browser Back Button
window.addEventListener('popstate', (event) => {
    handleRouting();
});

function handleRouting() {
    const path = window.location.pathname;
    if (path.startsWith('/article/')) {
        const id = path.split('/')[2];
        // Render article without pushing state
        const story = STORIES.find(s => s.id === id);
        if (story) {
            const container = document.getElementById('view-container');
            document.querySelectorAll('.table-tab-btn').forEach(btn => btn.classList.remove('active'));
            container.innerHTML = `
                    <div style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); max-width: 800px; margin: 0 auto;">
                        <button onclick="goBackFromArticle()" style="margin-bottom: 20px; cursor: pointer; border: none; background: none; color: #718096; font-weight: 600;">&larr; Back to Odds</button>
                        ${story.fullContent}
                    </div>
                `;
        }
    } else {
        renderView('league');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await fetchData();
    // Initial Route Check
    handleRouting();
    renderAsideStories();
});

function renderTable(container, filter) {
    const table = document.createElement('table');
    table.id = 'odds-table';

    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th class="col-team" onclick="changeSort('team')">Team ${getSortArrow('team')}</th>
            <th class="col-record" onclick="changeSort('record')">Record ${getSortArrow('record')}</th>
            <th class="col-confdiv">Conf/Div</th>
            <th class="col-playoff" onclick="changeSort('playoff')">Playoffs ${getSortArrow('playoff')}</th>
            <th class="col-division" onclick="changeSort('div')">Win Div ${getSortArrow('div')}</th>
            <th class="col-seed1" onclick="changeSort('seed1')">Bye ${getSortArrow('seed1')}</th>
            <th class="col-sb" onclick="changeSort('sb')">Super Bowl ${getSortArrow('sb')}</th>
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

        const sim = team.simData || { madePlayoffs: 0, wonDivision: 0, seed1: 0, wonSuperBowl: 0 };
        const total = sim.totalSims || 1;

        const pPlayoff = (sim.madePlayoffs / total * 100).toFixed(1);
        const pDiv = (sim.wonDivision / total * 100).toFixed(1);
        const pSeed1 = (sim.seed1 / total * 100).toFixed(1);
        const pSB = (sim.wonSuperBowl / total * 100).toFixed(1);

        // Colors
        const cellColor = (val) => {
            const v = parseFloat(val);
            if (v >= 99.9) return `background-color: #2c5282; color: white;`;
            if (v <= 0.1) return `background-color: white; color: #ccc;`;
            const alpha = v / 100;
            return `background-color: rgba(66, 153, 225, ${alpha}); color: ${v > 50 ? 'white' : 'black'};`;
        };

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
            <td class="heatmap-cell" style="${cellColor(pSB)}">${pSB}%</td>
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
        const simA = a.simData || { madePlayoffs: 0, wonDivision: 0, seed1: 0, wonSuperBowl: 0 };
        const simB = b.simData || { madePlayoffs: 0, wonDivision: 0, seed1: 0, wonSuperBowl: 0 };
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
            case 'sb':
                valA = simA.wonSuperBowl / totalA; valB = simB.wonSuperBowl / totalB;
                break;
            default:
                valA = getWinPct(a); valB = getWinPct(b);
        }

        if (Math.abs(valA - valB) > 0.0001) {
            if (valA < valB) return CURRENT_SORT.dir === 'asc' ? -1 : 1;
            if (valA > valB) return CURRENT_SORT.dir === 'asc' ? 1 : -1;
        }

        // Tiebreaker: Sort by Record Wins Descending (for non-playoff / 0% teams)
        const winsA = a.record.wins + 0.5 * a.record.ties;
        const winsB = b.record.wins + 0.5 * b.record.ties;
        return winsB - winsA;

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

        // Helper to find team by seed and conf
        const getSeed = (teams, conf, seedNum) =>
            teams.find(t => t.conference === conf && (t.seed === seedNum || t.simData?.seed1 && seedNum === 1));

        const teamsArr = Object.values(GLOBAL_DATA.teams);

        // AFC Matchups
        const afc1 = teamsArr.find(t => t.conference === 'AFC' && t.seed === 1);
        const afc2 = teamsArr.find(t => t.conference === 'AFC' && t.seed === 2);
        const afc3 = teamsArr.find(t => t.conference === 'AFC' && t.seed === 3);
        const afc4 = teamsArr.find(t => t.conference === 'AFC' && t.seed === 4);
        const afc5 = teamsArr.find(t => t.conference === 'AFC' && t.seed === 5);
        const afc6 = teamsArr.find(t => t.conference === 'AFC' && t.seed === 6);
        const afc7 = teamsArr.find(t => t.conference === 'AFC' && t.seed === 7);

        // NFC Matchups
        const nfc1 = teamsArr.find(t => t.conference === 'NFC' && t.seed === 1);
        const nfc2 = teamsArr.find(t => t.conference === 'NFC' && t.seed === 2);
        const nfc3 = teamsArr.find(t => t.conference === 'NFC' && t.seed === 3);
        const nfc4 = teamsArr.find(t => t.conference === 'NFC' && t.seed === 4);
        const nfc5 = teamsArr.find(t => t.conference === 'NFC' && t.seed === 5);
        const nfc6 = teamsArr.find(t => t.conference === 'NFC' && t.seed === 6);
        const nfc7 = teamsArr.find(t => t.conference === 'NFC' && t.seed === 7);

        const renderMatchup = (t1, t2) => {
            if (!t1 || !t2) return '';
            return `
                <div class="ticker-item matchup-item" style="border-right: 1px solid #4a5568; padding-right: 20px;">
                    <div class="ticker-team">
                        <span style="font-size:10px; color:#a0aec0; margin-right:4px;">${t1.seed}</span>
                        <img src="${t1.logo}" class="ticker-logo" onerror="this.style.display='none'">
                        <span class="ticker-abbr">${t1.abbr}</span>
                    </div>
                    <span style="font-size:12px; font-weight:700; color:#e2e8f0; margin:0 8px;">VS</span>
                    <div class="ticker-team" style="margin-right:0;">
                        <span style="font-size:10px; color:#a0aec0; margin-right:4px;">${t2.seed}</span>
                        <img src="${t2.logo}" class="ticker-logo" onerror="this.style.display='none'">
                        <span class="ticker-abbr">${t2.abbr}</span>
                    </div>
                </div>
            `;
        };

        const renderBye = (t) => {
            if (!t) return '';
            return `
                <div class="ticker-item matchup-item" style="border-right: 1px solid #4a5568; padding-right: 20px;">
                     <div class="ticker-team">
                        <span style="font-size:10px; color:#a0aec0; margin-right:4px;">1</span>
                        <img src="${t.logo}" class="ticker-logo" onerror="this.style.display='none'">
                        <span class="ticker-abbr">${t.abbr}</span>
                    </div>
                    <span class="ticker-label ticker-clinched" style="margin-left:8px;">BYE WEEK</span>
                </div>
            `;
        }

        // Build String
        itemsHtml += renderBye(afc1);
        itemsHtml += renderMatchup(afc2, afc7);
        itemsHtml += renderMatchup(afc3, afc6);
        itemsHtml += renderMatchup(afc4, afc5);

        itemsHtml += renderBye(nfc1);
        itemsHtml += renderMatchup(nfc2, nfc7);
        itemsHtml += renderMatchup(nfc3, nfc6);
        itemsHtml += renderMatchup(nfc4, nfc5);

        return itemsHtml;
    };

    const tickerContent = createTickerContent();

    // Simple Marquee style - Double the content for seamless wrap
    // Updated ticker to open article on click
    let html = `
    <div class="news-ticker" onclick="renderView('article', 'steelers-ravens-week-18')" style="cursor: pointer;">
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
