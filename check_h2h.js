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
        // SF: 25, LAR: 14
        const sf_id = 25;
        const lar_id = 14;

        const ia_games = games.filter(g =>
            (g.homeId == sf_id && g.awayId == lar_id) ||
            (g.homeId == lar_id && g.awayId == sf_id)
        );

        console.log(`Found ${ia_games.length} games between SF and LAR:`);
        let sf_wins = 0;
        let lar_wins = 0;

        ia_games.forEach(g => {
            const winner = g.homeScore > g.awayScore ? g.homeId : (g.awayScore > g.homeScore ? g.awayId : 'tie');
            console.log(`${g.homeId} vs ${g.awayId} -> ${g.homeScore}-${g.awayScore} (Winner: ${winner})`);
            if (winner == sf_id) sf_wins++;
            if (winner == lar_id) lar_wins++;
        });

        console.log(`SF Wins: ${sf_wins}, LAR Wins: ${lar_wins}`);

    } catch (e) {
        console.error(e);
    }
}

checkH2H();
