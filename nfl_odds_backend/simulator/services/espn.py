import requests
from ..structure import get_team_structure
from datetime import datetime

# Utility to get season
def get_current_season():
    now = datetime.now()
    # If month >= 9 (Sep), it's that year.
    # If month <= 2 (Feb), it's previous year (Feb 2026 is 2025 season).
    if now.month >= 9:
        return now.year
    return now.year - 1

CURRENT_SEASON = 2025 # Forced as per V3 requirement

class ESPNEndpoints:
    BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl"
    
    @classmethod
    def teams(cls, limit=40):
        return f"{cls.BASE_URL}/teams?limit={limit}"
    
    @classmethod
    def standings(cls, season):
        return f"{cls.BASE_URL}/standings?season={season}&seasontype=2"
        
    @classmethod
    def seasons(cls, season):
        # Full schedule for season
        # Logic from endpoints.js: 20250901 - 20260201 approx
        start = f"{season}0901"
        end = f"{season + 1}0201"
        return f"{cls.BASE_URL}/scoreboard?limit=1000&dates={start}-{end}"

class DataService:
    def __init__(self):
        self.cache = {
            "teams": {},
            "schedule": [],
            "timestamp": 0
        }
    
    def get_data(self):
        # Simple in-memory caching (1 minute?)
        # For now, just fetch fresh to verify, or implement basic check
        # Node impl fetched fresh on every /api/simulate? No, server.js had cache logic.
        # Let's fetch fresh for robustness first, optimize later.
        return self.fetch_fresh_data()
        
    def fetch_fresh_data(self):
        print("Fetching fresh data from ESPN...")
        try:
            # 1. Teams
            r_teams = requests.get(ESPNEndpoints.teams())
            r_teams.raise_for_status()
            teams_data = r_teams.json()
            
            teams = {}
            if 'sports' in teams_data and teams_data['sports']:
                leagues = teams_data['sports'][0].get('leagues', [])
                if leagues:
                    items = leagues[0].get('teams', [])
                    for item in items:
                        t = item.get('team')
                        if t:
                            struct = get_team_structure(t.get('abbreviation'))
                            teams[t['id']] = {
                                "id": t['id'],
                                "name": t.get('displayName'),
                                "abbr": t.get('abbreviation'),
                                "logo": t.get('logos', [{}])[0].get('href', ''),
                                "record": { "wins": 0, "losses": 0, "ties": 0 },
                                "stats": { "pointsFor": 0, "pointsAgainst": 0, "gamesPlayed": 0 },
                                "conference": struct['conf'],
                                "division": struct['div'],
                                "divRecord": { "wins": 0, "losses": 0, "ties": 0 },
                                "confRecord": { "wins": 0, "losses": 0, "ties": 0 }
                            }

            # 2. Schedule
            r_sched = requests.get(ESPNEndpoints.seasons(CURRENT_SEASON))
            r_sched.raise_for_status()
            sched_data = r_sched.json()
            
            schedule = []
            completed_games = []
            
            events = sched_data.get('events', [])
            for evt in events:
                comp = evt['competitions'][0]
                home = next((c for c in comp['competitors'] if c['homeAway'] == 'home'), None)
                away = next((c for c in comp['competitors'] if c['homeAway'] == 'away'), None)
                
                if not home or not away:
                    continue
                
                # Filter unknown teams
                if home['id'] not in teams or away['id'] not in teams:
                    continue

                is_completed = evt['status']['type']['completed']
                in_progress = (evt['status']['type']['state'] == 'in')
                period = evt['status'].get('period', 0)
                
                # Extract Linescores safely
                # linescores is list of {value: X, period: Y} or just objects. API varies.
                # usu: [{'value': 7}, {'value': 0} ... ]
                h_lines = [int(x.get('value', 0)) for x in home.get('linescores', [])]
                a_lines = [int(x.get('value', 0)) for x in away.get('linescores', [])]

                game_obj = {
                    "id": evt['id'],
                    "week": evt.get('week', {}).get('number'), # Might vary in structure
                    "homeId": home['id'],
                    "awayId": away['id'],
                    "homeScore": int(home.get('score', 0)),
                    "awayScore": int(away.get('score', 0)),
                    "completed": is_completed,
                    "in_progress": in_progress,
                    "period": period,
                    "homeLines": h_lines,
                    "awayLines": a_lines
                }
                
                schedule.append(game_obj)
                if is_completed:
                    completed_games.append(game_obj)

            # 3. Recalculate Records
            for g in completed_games:
                h_id = g['homeId']
                a_id = g['awayId']
                
                # Stats
                teams[h_id]['stats']['pointsFor'] += g['homeScore']
                teams[h_id]['stats']['pointsAgainst'] += g['awayScore']
                teams[h_id]['stats']['gamesPlayed'] += 1
                
                teams[a_id]['stats']['pointsFor'] += g['awayScore']
                teams[a_id]['stats']['pointsAgainst'] += g['homeScore']
                teams[a_id]['stats']['gamesPlayed'] += 1
                
                # Record
                if g['homeScore'] > g['homeScore']: # Wait, bug in original? No logic below checks scores
                    pass 
                
                # Winner determination
                winner = None
                if g['homeScore'] > g['awayScore']: winner = 'home'
                elif g['awayScore'] > g['homeScore']: winner = 'away'
                else: winner = 'tie'
                
                if winner == 'home':
                    teams[h_id]['record']['wins'] += 1
                    teams[a_id]['record']['losses'] += 1
                    if teams[h_id]['division'] == teams[a_id]['division']:
                        teams[h_id]['divRecord']['wins'] += 1
                        teams[a_id]['divRecord']['losses'] += 1
                    if teams[h_id]['conference'] == teams[a_id]['conference']:
                        teams[h_id]['confRecord']['wins'] += 1
                        teams[a_id]['confRecord']['losses'] += 1
                        
                elif winner == 'away':
                    teams[a_id]['record']['wins'] += 1
                    teams[h_id]['record']['losses'] += 1
                    if teams[h_id]['division'] == teams[a_id]['division']:
                        teams[a_id]['divRecord']['wins'] += 1
                        teams[h_id]['divRecord']['losses'] += 1
                    if teams[h_id]['conference'] == teams[a_id]['conference']:
                        teams[a_id]['confRecord']['wins'] += 1
                        teams[h_id]['confRecord']['losses'] += 1
                else:
                    teams[h_id]['record']['ties'] += 1
                    teams[a_id]['record']['ties'] += 1
                    if teams[h_id]['division'] == teams[a_id]['division']:
                        teams[h_id]['divRecord']['ties'] += 1
                        teams[a_id]['divRecord']['ties'] += 1
                    if teams[h_id]['conference'] == teams[a_id]['conference']:
                        teams[h_id]['confRecord']['ties'] += 1
                        teams[a_id]['confRecord']['ties'] += 1

            self.cache['teams'] = teams
            self.cache['schedule'] = schedule
            return { "teams": teams, "schedule": schedule }

        except Exception as e:
            print(f"Error fetching data: {e}")
            return { "teams": {}, "schedule": [] }
