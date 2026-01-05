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
        const chi = Object.values(teams).find(t => t.abbr === 'CHI');
        const phi = Object.values(teams).find(t => t.abbr === 'PHI');

        console.log(`CHI Record: ${chi.record.wins}-${chi.record.losses}-${chi.record.ties}`);
        console.log(`PHI Record: ${phi.record.wins}-${phi.record.losses}-${phi.record.ties}`);

        console.log(`CHI Conf Record: ${chi.confRecord.wins}-${chi.confRecord.losses}-${chi.confRecord.ties} (${getStatPct(chi.confRecord).toFixed(3)})`);
        console.log(`PHI Conf Record: ${phi.confRecord.wins}-${phi.confRecord.losses}-${phi.confRecord.ties} (${getStatPct(phi.confRecord).toFixed(3)})`);

    } catch (e) {
        console.error(e);
    }
}

audit();
