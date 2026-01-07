import axios from 'axios';

async function test() {
    try {
        console.log("Fetching from Core API...");
        const coreUrl = 'http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2024/types/2/teams/2/statistics';
        const coreRes = await axios.get(coreUrl);

        let categories = [];
        if (coreRes.data.splits && coreRes.data.splits.categories) {
            categories = coreRes.data.splits.categories;
        }

        if (categories) {
            categories.forEach(cat => {
                if (['general', 'miscellaneous', 'defensive'].includes(cat.name)) {
                    console.log(`\nCategory: ${cat.name}`);
                    if (cat.stats) {
                        cat.stats.forEach(s => {
                            console.log(`    ${s.name}: ${s.value} (Rank: ${s.rank})`);
                        });
                    }
                }
            });
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

test();
