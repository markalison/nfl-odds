import axios from 'axios';

const AXIOS_CONFIG = {
    headers: {
        'User-Agent': 'Mozilla/5.0'
    }
};

async function test() {
    const url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100";
    const res = await axios.get(url, AXIOS_CONFIG);
    const data = res.data;

    console.log("Season Type:", data.season.type); // 2 = Reg, 3 = Post

    data.events.forEach(evt => {
        const comp = evt.competitions[0];
        const status = evt.status.type;
        const home = comp.competitors.find(c => c.homeAway === 'home');
        const away = comp.competitors.find(c => c.homeAway === 'away');

        console.log(`${evt.date} | ${away.team.abbreviation} @ ${home.team.abbreviation} | Status: ${status.name} | Completed: ${status.completed} | Score: ${away.score}-${home.score}`);
    });
}

test();
