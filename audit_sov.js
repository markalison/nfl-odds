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

function getWinPct(t) {
    const tot = t.record.wins + t.record.losses + t.record.ties;
    return tot === 0 ? 0 : (t.record.wins + 0.5 * t.record.ties) / tot;
}

async function analyze() {
    try {
        const data = await fetchData();
        const teams = data.teams;
        const games = data.completed;

        // Helper to find defeated opponents
        const getDefeatedOpponents = (teamId) => {
            const opps = [];
            games.forEach(g => {
                if (g.homeId === teamId && g.homeScore > g.awayScore) opps.push(g.awayId);
                if (g.awayId === teamId && g.awayScore > g.homeScore) opps.push(g.homeId);
            });
            return opps;
        };

        const calculateSOV = (teamId) => {
            const opps = getDefeatedOpponents(teamId);
            if (opps.length === 0) return 0;
            let totalWins = 0;
            let totalGames = 0;
            opps.forEach(oppId => {
                const opp = teams[oppId];
                totalWins += opp.record.wins + (opp.record.ties * 0.5);
                totalGames += (opp.record.wins + opp.record.losses + opp.record.ties);
            });
            return totalGames === 0 ? 0 : totalWins / totalGames;
        };

        // Pairs to check
        const pairs = [
            { id1: '17', id2: '7', name: 'NE vs DEN' }, // AFC 1/2
            { id1: '25', id2: '14', name: 'SF vs LAR' }, // NFC West Div
            { id1: '3', id2: '21', name: 'CHI vs PHI' }, // NFC 2/3
            { id1: '34', id2: '2', name: 'HOU vs BUF' }  // AFC 5/6
        ];

        console.log("Deep Tiebreaker Audit (SOV):\n");

        pairs.forEach(p => {
            const t1 = teams[p.id1];
            const t2 = teams[p.id2];
            console.log(`--- ${p.name} ---`);
            console.log(`${t1.abbr}: ${t1.record.wins}-${t1.record.losses} | Conf: ${t1.confRecord.wins}-${t1.confRecord.losses} | Div: ${t1.divRecord.wins}-${t1.divRecord.losses}`);
            console.log(`${t2.abbr}: ${t2.record.wins}-${t2.record.losses} | Conf: ${t2.confRecord.wins}-${t2.confRecord.losses} | Div: ${t2.divRecord.wins}-${t2.divRecord.losses}`);

            const sov1 = calculateSOV(t1.id);
            const sov2 = calculateSOV(t2.id);
            console.log(`SOV: ${t1.abbr} (${sov1.toFixed(4)}) vs ${t2.abbr} (${sov2.toFixed(4)})`);
            console.log(`Winner: ${sov1 > sov2 ? t1.abbr : t2.abbr}\n`);
        });

    } catch (e) {
        console.error(e);
    }
}

analyze();
