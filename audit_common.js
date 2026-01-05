import http from 'http';

function fetchData() {
    return new Promise((resolve, reject) => {
        http.get('http://localhost:3000/api/data', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', (err) => reject(err));
    });
}

function getCommonGamesRecord(t1, t2, games) {
    // Find opponents played by both
    const opps1 = new Set();
    const opps2 = new Set();

    // Helper to get opponent
    const getOpp = (tid, g) => g.homeId === tid ? g.awayId : (g.awayId === tid ? g.homeId : null);

    games.forEach(g => {
        if (g.homeId === t1.id || g.awayId === t1.id) opps1.add(getOpp(t1.id, g));
        if (g.homeId === t2.id || g.awayId === t2.id) opps2.add(getOpp(t2.id, g));
    });

    const common = [...opps1].filter(x => opps2.has(x));

    if (common.length < 4) return { valid: false, reason: `Only ${common.length} common opponents` };

    // Calculate record vs common
    let w1 = 0, l1 = 0, t1_ties = 0;
    let w2 = 0, l2 = 0, t2_ties = 0;

    games.forEach(g => {
        const home = g.homeId;
        const away = g.awayId;

        // T1 vs Common
        if ((home === t1.id && common.includes(away)) || (away === t1.id && common.includes(home))) {
            const result = (g.homeScore > g.awayScore && home === t1.id) || (g.awayScore > g.homeScore && away === t1.id) ? 'win' :
                (g.homeScore === g.awayScore) ? 'tie' : 'loss';
            if (result === 'win') w1++;
            if (result === 'loss') l1++;
            if (result === 'tie') t1_ties++;
        }

        // T2 vs Common
        if ((home === t2.id && common.includes(away)) || (away === t2.id && common.includes(home))) {
            const result = (g.homeScore > g.awayScore && home === t2.id) || (g.awayScore > g.homeScore && away === t2.id) ? 'win' :
                (g.homeScore === g.awayScore) ? 'tie' : 'loss';
            if (result === 'win') w2++;
            if (result === 'loss') l2++;
            if (result === 'tie') t2_ties++;
        }
    });

    const pct1 = (w1 + 0.5 * t1_ties) / (w1 + l1 + t1_ties);
    const pct2 = (w2 + 0.5 * t2_ties) / (w2 + l2 + t2_ties);

    return {
        valid: true,
        commonCount: common.length,
        t1: { w: w1, l: l1, pct: pct1 },
        t2: { w: w2, l: l2, pct: pct2 }
    };
}

async function analyze() {
    try {
        const data = await fetchData();
        const teams = data.teams;
        const games = data.completed;

        const pairs = [
            { id1: '17', id2: '7', name: 'NE vs DEN' },
            { id1: '25', id2: '14', name: 'SF vs LAR' },
            { id1: '3', id2: '21', name: 'CHI vs PHI' },
            { id1: '34', id2: '2', name: 'HOU vs BUF' }
        ];

        console.log("Deep Tiebreaker Audit (Common Games):\n");

        pairs.forEach(p => {
            const t1 = teams[p.id1];
            const t2 = teams[p.id2];
            console.log(`--- ${p.name} ---`);
            const res = getCommonGamesRecord(t1, t2, games);

            if (!res.valid) {
                console.log(`Common Games Inapplicable: ${res.reason}`);
            } else {
                console.log(`Common Opponents: ${res.commonCount}`);
                console.log(`${t1.abbr}: ${res.t1.w}-${res.t1.l} (${res.t1.pct.toFixed(3)})`);
                console.log(`${t2.abbr}: ${res.t2.w}-${res.t2.l} (${res.t2.pct.toFixed(3)})`);
                if (Math.abs(res.t1.pct - res.t2.pct) > 0.001) {
                    console.log(`Winner: ${res.t1.pct > res.t2.pct ? t1.abbr : t2.abbr}`);
                } else {
                    console.log("Tie - Go to SOV");
                }
            }
            console.log("");
        });

    } catch (e) {
        console.error(e);
    }
}

analyze();
