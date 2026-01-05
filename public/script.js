
// script.js - Frontend Controller (V3 - Backend Connected)

// We no longer import Logic classes here. We call the API.

let teams = {};
let games = []; // Schedule
let simResults = {};
let userOverrides = {}; // { teamId: 'win'|'loss'|'tie' }

// UI State
let currentFilter = 'all'; // 'all', 'conf-AFC', 'div-AFC East'
let sortCol = 'madePlayoffs';
let sortDesc = true;

const API_BASE = ''; // Relative path, same origin

async function init() {
    const loading = document.getElementById('loading-indicator');
    loading.classList.add('visible');

    try {
        // Fetch Base Data
        const res = await fetch(`${API_BASE}/api/data`);
        const data = await res.json();

        teams = data.teams;
        games = data.schedule;

        // Initial Sim
        await runSim();

        renderTable();
        setupEventListeners();

    } catch (e) {
        console.error("Init failed", e);
        alert("Failed to connect to backend. Make sure 'npm start' is running.");
    } finally {
        loading.classList.remove('visible');
    }
}

async function runSim() {
    const loading = document.getElementById('loading-indicator');
    loading.classList.add('visible');

    try {
        const res = await fetch(`${API_BASE}/api/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ overrides: userOverrides })
        });

        simResults = await res.json();
        renderTable();

    } catch (e) {
        console.error("Sim failed", e);
    } finally {
        loading.classList.remove('visible');
    }
}

// ... Rest of the UI logic (Rendering, Filtering, Sorting) remains mostly same but stateless ...

function getFilteredTeams() {
    const list = Object.values(teams);
    if (currentFilter === 'all') return list;

    if (currentFilter.startsWith('conf-')) {
        const conf = currentFilter.split('-')[1];
        return list.filter(t => t.conference === conf);
    }

    if (currentFilter.startsWith('div-')) {
        const div = currentFilter.split('-')[1];
        return list.filter(t => t.division === div);
    }
    return list;
}

function handleSort(col) {
    if (sortCol === col) {
        sortDesc = !sortDesc;
    } else {
        sortCol = col;
        sortDesc = true;
    }
    renderTable();
    updateSortHeaders();
}

function updateSortHeaders() {
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.classList.remove('asc', 'desc');
        if (th.dataset.sort === sortCol) {
            th.classList.add(sortDesc ? 'desc' : 'asc');
        }
    });

}

function getBackgroundColor(value) {
    // 0-100 scale
    // Navy Theme: White (0) -> Light Blue (50) -> Navy (100)

    let r, g, b, text = 'black';

    if (value < 50) {
        // White -> Light Blue
        const p = value / 50;
        r = Math.round(255 + (144 - 255) * p);
        g = Math.round(255 + (205 - 255) * p);
        b = Math.round(255 + (244 - 255) * p);
    } else {
        // Light Blue -> Navy
        const p = (value - 50) / 50;
        r = Math.round(144 + (44 - 144) * p);
        g = Math.round(205 + (82 - 205) * p);
        b = Math.round(244 + (130 - 244) * p);
        if (value > 80) text = 'white';
    }

    if (value >= 100) return { bg: '#2c5282', text: 'white' }; // Max Navy
    if (value <= 0) return { bg: '#ffffff', text: '#ccc' };

    return { bg: `rgb(${r}, ${g}, ${b})`, text: text };
}

function formatOdds(val) {
    // val is frequency 0-1000
    // Convert to percentage
    const p = (val / 1000) * 100;
    if (p === 100) return '100%';
    if (p === 0) return '<1%';
    if (p > 99.9) return '>99%';
    if (p < 0.1) return '<1%';
    return p.toFixed(1) + '%';
}

function renderTable() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    const teamList = getFilteredTeams();

    // Sort
    teamList.sort((a, b) => {
        let valA, valB;

        if (sortCol === 'name') {
            valA = a.name;
            valB = b.name;
        } else if (sortCol === 'record') {
            valA = a.record.wins + (a.record.ties * 0.5);
            valB = b.record.wins + (b.record.ties * 0.5);
        } else {
            const resA = simResults[a.id] || { [sortCol]: 0 };
            const resB = simResults[b.id] || { [sortCol]: 0 };
            valA = resA[sortCol];
            valB = resB[sortCol];
        }

        if (valA < valB) return sortDesc ? 1 : -1;
        if (valA > valB) return sortDesc ? -1 : 1;
        return 0;
    });

    teamList.forEach(team => {
        const res = simResults[team.id] || { madePlayoffs: 0, wonDivision: 0, seed1: 0 };
        const sel = userOverrides[team.id] || 'none';

        const tr = document.createElement('tr');

        // Team
        const teamTd = document.createElement('td');
        teamTd.className = 'team-cell';
        teamTd.innerHTML = `
            <img src="${team.logo || 'https://via.placeholder.com/24'}" class="team-logo" alt="">
            <span>${team.name}</span>
        `;

        // Record
        const recTd = document.createElement('td');
        recTd.className = 'record-cell';
        recTd.textContent = `${team.record.wins}-${team.record.losses}${team.record.ties ? '-' + team.record.ties : ''}`;

        // Controls
        const ctrlTd = document.createElement('td');
        ctrlTd.className = 'col-next-game';
        const controls = document.createElement('div');
        controls.className = 'sim-controls';
        ['Win', 'Loss', 'Tie'].forEach(type => {
            const btn = document.createElement('button');
            btn.className = `sim-btn ${type.toLowerCase()} ${sel === type.toLowerCase() ? 'active' : ''}`;
            btn.textContent = type;
            btn.onclick = () => handleOverride(team.id, type.toLowerCase());
            controls.appendChild(btn);
        });
        ctrlTd.appendChild(controls);

        tr.append(teamTd, recTd, ctrlTd);

        // Data Columns
        const metrics = [
            { key: 'seed1', val: res.seed1 },
            { key: 'wonDivision', val: res.wonDivision },
            { key: 'madePlayoffs', val: res.madePlayoffs },
        ];

        metrics.forEach(m => {
            const td = document.createElement('td');
            const pct = (m.val / 1000) * 100;
            const style = getBackgroundColor(pct);

            td.className = 'heatmap-cell';
            td.textContent = formatOdds(m.val);
            td.style.backgroundColor = style.bg;
            td.style.color = style.text;
            tr.appendChild(td);
        });

        const confTd = document.createElement('td');
        confTd.className = 'heatmap-cell';
        confTd.textContent = '-';
        confTd.style.color = '#ccc';
        tr.appendChild(confTd);

        tbody.appendChild(tr);
    });
}

function handleOverride(teamId, type) {
    if (userOverrides[teamId] === type) {
        delete userOverrides[teamId];
    } else {
        userOverrides[teamId] = type;
    }
    // Refresh sim via API
    runSim();
}

function setupEventListeners() {
    document.getElementById('tabs-container').addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn')) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderTable();
        }
    });

    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            handleSort(th.dataset.sort);
        });
    });
}

document.addEventListener('DOMContentLoaded', init);
