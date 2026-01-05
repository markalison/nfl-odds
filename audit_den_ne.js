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

function getStatPct(rec) {
    if (!rec) return 0;
    const tot = rec.wins + rec.losses + rec.ties;
    if (tot === 0) return 0;
    return (rec.wins + 0.5 * rec.ties) / tot;
}

async function audit() {
    try {
        const data = await fetchData();
        const teams = data.teams;
        const den = Object.values(teams).find(t => t.abbr === 'DEN');
        const ne = Object.values(teams).find(t => t.abbr === 'NE');

        console.log(`DEN Conf Record: ${den.confRecord.wins}-${den.confRecord.losses}-(${getStatPct(den.confRecord).toFixed(3)})`);
        console.log(`NE Conf Record: ${ne.confRecord.wins}-${ne.confRecord.losses}-(${getStatPct(ne.confRecord).toFixed(3)})`);

        // Common games already audited previously as DEN 1.0 vs NE 0.833

    } catch (e) {
        console.error(e);
    }
}

audit();
