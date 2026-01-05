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

async function analyze() {
    try {
        const data = await fetchData();
        const southTeams = Object.values(data.teams).filter(t => t.division === 'NFC South');

        console.log("NFC South Teams:");
        southTeams.forEach(t => console.log(`${t.name} (ID:${t.id}): ${t.record.wins}-${t.record.losses}`));

        const tids = southTeams.map(t => t.id);
        const mapIdToAbbr = {};
        southTeams.forEach(t => mapIdToAbbr[t.id] = t.abbr);

        const h2h = {}; // key: "id1-id2"
        const divRec = {}; // key: id

        tids.forEach(id => {
            divRec[id] = { w: 0, l: 0 };
            tids.forEach(id2 => {
                if (id !== id2) h2h[`${id}-${id2}`] = 0;
            });
        });

        console.log(`\nScanning ${data.completed.length} completed games...`);

        data.completed.forEach(g => {
            if (tids.includes(g.homeId) && tids.includes(g.awayId)) {
                // H2H match
                let winner, loser;
                if (g.homeScore > g.awayScore) { winner = g.homeId; loser = g.awayId; }
                else if (g.awayScore > g.homeScore) { winner = g.awayId; loser = g.homeId; }
                else return; // Tie

                h2h[`${winner}-${loser}`]++;
                divRec[winner].w++;
                divRec[loser].l++;

                // Log specific games for manual audit
                console.log(`Game: ${mapIdToAbbr[winner]} def ${mapIdToAbbr[loser]} (${g.homeScore}-${g.awayScore})`);
            }
        });

        console.log("\nHead-to-Head Matrix (Wins against opponent):");
        southTeams.forEach(tA => {
            let line = `${tA.abbr}: `;
            southTeams.forEach(tB => {
                if (tA.id === tB.id) return;
                line += `vs ${tB.abbr}: ${h2h[`${tA.id}-${tB.id}`]} | `;
            });
            console.log(line);
        });

        // Calculate "Group H2H Pct" (Games won among the group / Games played among the group)
        console.log("\nGroup Tiebreaker Analysis (W-L among tied teams):");
        southTeams.forEach(tA => {
            let wins = 0;
            let played = 0;
            southTeams.forEach(tB => {
                if (tA.id === tB.id) return;
                wins += h2h[`${tA.id}-${tB.id}`];
                played += h2h[`${tA.id}-${tB.id}`] + h2h[`${tB.id}-${tA.id}`];
            });
            const pct = played > 0 ? (wins / played).toFixed(3) : "0.000";
            console.log(`${tA.abbr}: ${wins}-${played - wins} (${pct})`);
        });

        console.log("\nDivision Records:");
        southTeams.forEach(t => {
            console.log(`${t.name}: ${divRec[t.id].w}-${divRec[t.id].l}`);
        });

    } catch (e) {
        console.error("Error:", e);
    }
}

analyze();
