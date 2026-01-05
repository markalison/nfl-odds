
const https = require('https');

const url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const json = JSON.parse(data);
        console.log("Season Year:", json.season.year);
        console.log("Current Week:", json.week.number);
        console.log("Season Type:", json.season.type);
    });
}).on('error', (err) => {
    console.error("Error:", err.message);
});
