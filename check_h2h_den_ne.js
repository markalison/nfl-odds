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
        // DEN: 7, NE: 17
        const den_id = 7;
        const ne_id = 17;

        const ia_games = games.filter(g =>
            (g.homeId == den_id && g.awayId == ne_id) ||
            (g.homeId == ne_id && g.awayId == den_id)
        );

        console.log(`Found ${ia_games.length} games between DEN and NE:`);
        ia_games.forEach(g => {
            const winner = g.homeScore > g.awayScore ? g.homeId : (g.awayScore > g.homeScore ? g.awayId : 'tie');
            console.log(`${g.homeId} vs ${g.awayId} -> ${g.homeScore}-${g.awayScore} (Winner: ${winner})`);
        });

    } catch (e) {
        console.error(e);
    }
}

checkH2H();
