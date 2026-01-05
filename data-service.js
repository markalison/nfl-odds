
const BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

export class DataService {
    constructor() {
        this.teams = {};
        this.schedule = [];
        this.currentWeek = 1;
        this.seasonType = 2; // Regular Season
    }

    async init() {
        await this.fetchStandings();
        await this.fetchSchedule();
        return { teams: this.teams, schedule: this.schedule };
    }

    async fetchStandings() {
        try {
            const response = await fetch(`${BASE_URL}/standings?season=2025&seasontype=2`);
            const data = await response.json();

            // Process standings
            // ESPN structure is somewhat deep:
            // children[0] (AFC) -> children[0..3] (Divisions) -> standings.entries -> team

            // Helper to recurse and find team entries
            const processGroup = (group) => {
                if (group.standings && group.standings.entries) {
                    group.standings.entries.forEach(entry => {
                        const team = entry.team;
                        const stats = entry.stats;

                        // Find W-L-T
                        const wins = stats.find(s => s.name === 'wins')?.value || 0;
                        const losses = stats.find(s => s.name === 'losses')?.value || 0;
                        const ties = stats.find(s => s.name === 'ties')?.value || 0;
                        const pf = stats.find(s => s.name === 'pointsFor')?.value || 0;
                        const pa = stats.find(s => s.name === 'pointsAgainst')?.value || 0;

                        // Conference and Division records are often in specific stats
                        // But for simplicity in simulation, we might recalculate them or pull them if available.
                        // "confWins", "divisionWins" usually exist in stats array.

                        // Determine Conference and Division from parent group names if possible,
                        // but entry also usually has links.
                        // We'll rely on our specific map or ESPN data.

                        const teamData = {
                            id: team.id,
                            name: team.displayName,
                            abbr: team.abbreviation,
                            logo: team.logos?.[0]?.href || '',
                            record: { wins, losses, ties },
                            confRecord: { wins: 0, losses: 0, ties: 0 }, // Will fill if found
                            divRecord: { wins: 0, losses: 0, ties: 0 }, // Will fill if found
                            conference: '', // Need to map
                            division: '',   // Need to map
                            pointsFor: pf,
                            pointsAgainst: pa
                        };

                        this.teams[team.id] = teamData;
                    });
                }
                if (group.children) {
                    group.children.forEach(child => processGroup(child));
                }
            };

            if (data.children) {
                data.children.forEach(conf => {
                    // conference name is in conf.name (e.g., "AFC")
                    const confName = conf.shortName || conf.name;
                    conf.children.forEach(div => {
                        // Division name e.g., "AFC East"
                        const divName = div.name;

                        if (div.standings && div.standings.entries) {
                            div.standings.entries.forEach(entry => {
                                // Apply the processing logic but we also know the conf/div here
                                const tId = entry.team.id;
                                if (!this.teams[tId]) {
                                    // We need to extract stats first as above
                                    const stats = entry.stats;
                                    const wins = stats.find(s => s.name === 'wins')?.value || 0;
                                    const losses = stats.find(s => s.name === 'losses')?.value || 0;
                                    const ties = stats.find(s => s.name === 'ties')?.value || 0;
                                    const pf = stats.find(s => s.name === 'pointsFor')?.value || 0;

                                    this.teams[tId] = {
                                        id: tId,
                                        name: entry.team.displayName,
                                        abbr: entry.team.abbreviation,
                                        logo: entry.team.logos?.[0]?.href || '',
                                        record: { wins, losses, ties },
                                        conference: confName,
                                        division: divName,
                                        pf: pf
                                    };
                                } else {
                                    this.teams[tId].conference = confName;
                                    this.teams[tId].division = divName;
                                }
                            });
                        }
                    });
                });
            }

        } catch (e) {
            console.error("Error fetching standings:", e);
            // Fallback?
        }
    }

    async fetchSchedule() {
        try {
            // First get current week info from scoreboard
            const sbResponse = await fetch(`${BASE_URL}/scoreboard`);
            const sbData = await sbResponse.json();

            const currentWeek = sbData.week?.number || 1;
            const currentSeasonType = sbData.season?.type || 2;

            // If we are in postseason, simulation behaves differently, but let's assume Reg Season
            // Fetch checks for weeks current -> 18

            // Create array of promises for remaining weeks
            const promises = [];
            // Assuming 18 weeks regular season
            for (let w = currentWeek; w <= 18; w++) {
                promises.push(fetch(`${BASE_URL}/scoreboard?week=${w}&seasontype=2&season=2025`).then(res => res.json()));
            }

            const weeksData = await Promise.all(promises);

            weeksData.forEach(weekData => {
                const weekNum = weekData.week.number;
                weekData.events.forEach(event => {
                    const comp = event.competitions[0];
                    const home = comp.competitors.find(c => c.homeAway === 'home');
                    const away = comp.competitors.find(c => c.homeAway === 'away');

                    // Only add if not completed
                    // status.type.completed
                    if (!event.status.type.completed) {
                        this.schedule.push({
                            id: event.id,
                            week: weekNum,
                            homeId: home.team.id,
                            homeName: home.team.displayName,
                            awayId: away.team.id,
                            awayName: away.team.displayName,
                            homeScore: 0,
                            awayScore: 0,
                            completed: false
                        });
                    }
                });
            });

        } catch (e) {
            console.error("Error fetching schedule:", e);
        }
    }
}
