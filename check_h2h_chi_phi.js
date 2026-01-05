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

async function checkH2H() {
    try {
        const data = await fetchData();
        const games = data.completed;
        // CHI: 3, PHI: 21
        const chi_id = 3;
        const phi_id = 21;

        const ia_games = games.filter(g =>
            (g.homeId == chi_id && g.awayId == phi_id) ||
            (g.homeId == phi_id && g.awayId == chi_id)
        );

        console.log(`Found ${ia_games.length} games between CHI and PHI:`);
        ia_games.forEach(g => {
            const winner = g.homeScore > g.awayScore ? g.homeId : (g.awayScore > g.homeScore ? g.awayId : 'tie');
            console.log(`${g.homeId} vs ${g.awayId} -> ${g.homeScore}-${g.awayScore} (Winner: ${winner})`);
        });

    } catch (e) {
        console.error(e);
    }
}

checkH2H();
