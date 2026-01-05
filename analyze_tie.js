import fs from 'fs';
import { fileURLToPath } from 'url';
const data = JSON.parse(fs.readFileSync('nfl_data.json', 'utf8'));

const southTeams = Object.values(data.teams).filter(t => t.division === 'NFC South');
console.log("NFC South Teams:");
southTeams.forEach(t => console.log(`${t.name} (${t.abbreviation}): ${t.record.wins}-${t.record.losses}`));

const tids = southTeams.map(t => t.id);
const h2h = {}; // key: "id1-id2"
const divRec = {}; // key: id

tids.forEach(id => {
    divRec[id] = { w: 0, l: 0 };
    tids.forEach(id2 => {
        if (id !== id2) h2h[`${id}-${id2}`] = 0;
    });
});

data.completed.forEach(g => {
    if (tids.includes(g.homeId) && tids.includes(g.awayId)) {
        // H2H match
        let winner = g.homeScore > g.awayScore ? g.homeId : g.awayId;
        let loser = g.homeScore > g.awayScore ? g.awayId : g.homeId;

        h2h[`${winner}-${loser}`]++;

        divRec[winner].w++;
        divRec[loser].l++;
    }
});

console.log("\nHead-to-Head Matrix (Wins against opponent):");
southTeams.forEach(tA => {
    let line = `${tA.abbreviation}: `;
    southTeams.forEach(tB => {
        if (tA.id === tB.id) return;
        line += `vs ${tB.abbreviation}: ${h2h[`${tA.id}-${tB.id}`]} | `;
    });
    console.log(line);
});

console.log("\nDivision Records:");
southTeams.forEach(t => {
    console.log(`${t.name}: ${divRec[t.id].w}-${divRec[t.id].l}`);
});
