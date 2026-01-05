import random
import time
import copy
from ..structure import get_team_structure

HOME_ADVANTAGE = 2.0
ITERATIONS = 1000

class SimulationEngine:
    def __init__(self, teams, games):
        self.teams = teams
        self.games = games
        self.h2h_records = self.build_h2h_records()
        self.matchup_map = self.build_matchup_map()
    
    def build_h2h_records(self):
        """Build head-to-head win records from completed games.
        Returns: { (team1_id, team2_id): wins_by_team1 }
        """
        h2h = {}
        for game in self.games:
            if not game.get('completed'):
                continue
            
            h_id = game['homeId']
            a_id = game['awayId']
            
            # Determine winner
            if game['homeScore'] > game['awayScore']:
                winner, loser = h_id, a_id
            elif game['awayScore'] > game['homeScore']:
                winner, loser = a_id, h_id
            else:
                continue  # Ties don't count for h2h
            
            # Store both directions
            key1 = (winner, loser)
            key2 = (loser, winner)
            h2h[key1] = h2h.get(key1, 0) + 1
            if key2 not in h2h:
                h2h[key2] = 0
                
        return h2h
    
    def build_matchup_map(self):
        """Map (t1, t2) -> list of games."""
        mm = {}
        for g in self.games:
            t1, t2 = g['homeId'], g['awayId']
            k = tuple(sorted((t1, t2)))
            if k not in mm: mm[k] = []
            mm[k].append(g)
        return mm

    def get_live_rating(self, team):
        stats = team.get('stats')
        if not stats or stats['gamesPlayed'] == 0:
            return 0
        
        # 1. Point Differential (Efficiency)
        avg_diff = (stats['pointsFor'] - stats['pointsAgainst']) / stats['gamesPlayed']
        
        # 2. Win Percentage (Result-oriented)
        win_pct = self.get_win_pct(team)
        
        # 3. Blended Rating
        # avg_diff is usually between -10 and +10.
        # win_pct is 0.0 to 1.0. (win_pct - 0.5) is -0.5 to +0.5.
        # To make win_pct comparable to points, multiply by ~10 (e.g. 50% win = 0, 100% win = +5 pts)
        
        record_factor = (win_pct - 0.5) * 10 
        
        # Blend: 70% Efficiency, 30% Record (Adjust weights as needed for "SOS" feel)
        # Actually, let's imply simplistic SOS: Good record usually implies decent team.
        rating = (avg_diff * 0.7) + (record_factor * 0.3)
        return rating

    def get_win_pct(self, team):
        rec = team['record']
        total = rec['wins'] + rec['losses'] + rec['ties']
        if total == 0:
            return 0.5
        return (rec['wins'] + (rec['ties'] * 0.5)) / total

    def compare_teams(self, a, b):
        # 1. Win Pct
        awp = self.get_win_pct(a)
        bwp = self.get_win_pct(b)
        if awp != bwp:
            return bwp - awp # Descending
        
        # 2. Coin flip
        return random.random() - 0.5

    def update_standings(self, teams, h_id, a_id, result):
        # Simple record update for simulation
        if result == 'home':
            teams[h_id]['record']['wins'] += 1
            teams[a_id]['record']['losses'] += 1
            if teams[h_id]['division'] == teams[a_id]['division']:
                teams[h_id]['divRecord']['wins'] += 1
                teams[a_id]['divRecord']['losses'] += 1
            if teams[h_id]['conference'] == teams[a_id]['conference']:
                teams[h_id]['confRecord']['wins'] += 1
                teams[a_id]['confRecord']['losses'] += 1
        elif result == 'away':
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

    def run(self, overrides=None):
        if overrides is None:
            overrides = {}
            
        # Init Results
        results = {}
        for tid in self.teams:
            results[tid] = {
                "id": tid,
                "madePlayoffs": 0,
                "wonDivision": 0,
                "wonSuperBowl": 0,
                "seed1": 0, "seed2": 0, "seed3": 0, "seed4": 0,
                "seed5": 0, "seed6": 0, "seed7": 0,
                "totalSims": ITERATIONS
            }

        # Pre-process Games
        sim_base_teams = copy.deepcopy(self.teams)
        games_to_sim = []

        # Fix games based on overrides
        # For Python, we can't look ahead easily for "Next Game" logic effectively without mapping
        # But we'll do the simple override: if game involves overridden team, and it's not completed? 
        # Wait, overrides logic in JS was complex.
        # Let's verify existing logic: "If UserOverride[id] is set, applying to THIS game if it involves them?"
        # For now, let's just stick to the basic simulation loop, ignoring complex overrides unless critical.
        # User asked for "results of monte carlo" so basic sim is priority.
        
        # ACTUALLY, implementing overrides is good.
        # Quick map of next game? 
        # Let's skip complex overrides for V1 Django port to ensure stability first.
        
        for game in self.games:
            if game['completed']:
                continue
                
            # Check overrides (Simplified: if override exists for Home/Away, apply it)
            # This applies to ALL future games for them? No, usually "Next Game".
            # Simulator.js handled this with "fixedGames".
            # I'll stick to pure sim for now to ensure we get ODDS first.
            games_to_sim.append(game)

        start_time = time.time()

        # Tracker for Leverage
        game_tracker = {}
        self.iteration_results = [] # Store history for scenario analysis

        for _ in range(ITERATIONS):
            # Lightweight clone?
            # copy.deepcopy is slow. 
            # Manual clone of records is faster.
            run_teams = {
                tid: {
                    "id": t['id'],
                    "conference": t['conference'],
                    "division": t['division'],
                    "record": t['record'].copy(),
                    "divRecord": t['divRecord'].copy(),
                    "confRecord": t.get('confRecord', {'wins':0,'losses':0,'ties':0}).copy(),
                    "stats": t['stats'] # ref ok
                } for tid, t in sim_base_teams.items()
            }
            
            sim_outcomes = {} # Track outcomes for this iter

            for game in games_to_sim:
                ht = run_teams.get(game['homeId'])
                at = run_teams.get(game['awayId'])
                
                if not ht or not at: continue

                # Check for Override
                # overrides = { '40154789': 'home', '40154790': 'away' }
                forced_outcome = overrides.get(str(game['id'])) # Ensure string key
                
                if forced_outcome in ['home', 'away', 'tie']:
                    outcome = forced_outcome
                else:
                    # Prob Calc
                    prob_home = 0.5
                    
                    if game.get('in_progress'):
                        # LIVE GAME LOGIC: Bias heavily based on score
                        h_score = game.get('homeScore', 0)
                        a_score = game.get('awayScore', 0)
                        diff = h_score - a_score
                        
                        # Sigmoid for live score impact
                        # 14 points = ~90% win prob?
                        # formula: 1 / (1 + 10^(-diff/10))
                        # diff=0 -> 0.5
                        # diff=10 -> 0.9
                        # diff=-10 -> 0.1
                        # Adjusting div factor for realism. 14 seems decent.
                        prob_home = 1 / (1 + 10 ** -(diff / 12.0))
                    else:
                        # Pre-Game Rating Logic
                        rh = self.get_live_rating(ht)
                        ra = self.get_live_rating(at)
                        spread = rh - ra + HOME_ADVANTAGE
                        prob_home = 1 / (1 + 10 ** -(spread / 16))
                    
                    outcome = 'tie'
                    r = random.random()
                    tie_prob = 0.003
                    
                    if r < prob_home - (tie_prob/2): outcome = 'home'
                    elif r > prob_home + (tie_prob/2): outcome = 'away'
                
                sim_outcomes[str(game['id'])] = outcome
                self.update_standings(run_teams, game['homeId'], game['awayId'], outcome)

            # Merge H2H
            iter_h2h = self.h2h_records.copy()
            for g in games_to_sim:
                # Optimized merge
                gid = str(g['id'])
                out = sim_outcomes.get(gid)
                if not out or out == 'tie': continue
                
                winner = g['homeId'] if out=='home' else g['awayId']
                loser = g['awayId'] if out=='home' else g['homeId']
                k = (winner, loser)
                iter_h2h[k] = iter_h2h.get(k, 0) + 1

            # Process Playoffs (Get Seeds for this iter)
            seed_map = self.process_playoffs(run_teams, results, iter_h2h)
            
            # --- Postseason Sim ---
            sb_winner = self.simulate_postseason(seed_map, run_teams)
            if sb_winner:
                results[sb_winner['id']]['wonSuperBowl'] += 1
            
            # --- Dependency Tracking (Rooting Guide) ---
            # Track correlation between EVERY game outcome and EVERY team's playoff success
            # Limit to top 32 games to save time if needed, but 1.2M ops is ok
            for g in games_to_sim: 
                gid = str(g['id'])
                outcome = sim_outcomes.get(gid)
                
                # We only care if outcome swung things.
                # Initialize tracker node if needed
                # Structure: dep_tracker[tid][gid] = {h_w:0, h_m:0, a_w:0, a_m:0}
                if not hasattr(self, 'dep_tracker'): self.dep_tracker = {} # Persist across loop if needed? No, local var.
                
                # Actually, defined outside loop
                pass 

            # --- Update Leverage/Tracker ---
            for g in games_to_sim:
                gid = str(g['id'])
                if gid not in game_tracker:
                    game_tracker[gid] = {
                        'obj': g,
                        'h_wins': 0, 'a_wins': 0,
                        'h_made_if_h': 0, 'h_made_if_a': 0, 
                        'a_made_if_h': 0, 'a_made_if_a': 0,
                        # ... other stats ...
                        'h_bye_if_h': 0, 'h_bye_if_a': 0,
                        'h_hf_if_h': 0, 'h_hf_if_a': 0,
                        'a_bye_if_h': 0, 'a_bye_if_a': 0,
                        'a_hf_if_h': 0, 'a_hf_if_a': 0,
                        # Dependency Store: Map<TeamID, {made_h:0, made_a:0}>
                        'deps': {} 
                    }
                
                tracker = game_tracker[gid]
                outcome = sim_outcomes.get(gid)
                
                # Update Participant Stats (Existing Logic)
                hid = g['homeId']
                aid = g['awayId']
                h_seed = seed_map.get(hid, 99)
                a_seed = seed_map.get(aid, 99)
                
                if outcome == 'home':
                    tracker['h_wins'] += 1
                    if h_seed <= 7: tracker['h_made_if_h'] += 1
                    if h_seed == 1: tracker['h_bye_if_h'] += 1
                    if h_seed <= 4: tracker['h_hf_if_h'] += 1
                    if a_seed <= 7: tracker['a_made_if_h'] += 1
                    if a_seed == 1: tracker['a_bye_if_h'] += 1
                    if a_seed <= 4: tracker['a_hf_if_h'] += 1
                elif outcome == 'away':
                    tracker['a_wins'] += 1
                    if h_seed <= 7: tracker['h_made_if_a'] += 1
                    if h_seed == 1: tracker['h_bye_if_a'] += 1
                    if h_seed <= 4: tracker['h_hf_if_a'] += 1
                    if a_seed <= 7: tracker['a_made_if_a'] += 1
                    if a_seed == 1: tracker['a_bye_if_a'] += 1
                    if a_seed <= 4: tracker['a_hf_if_a'] += 1

                # Update Dependencies for ALL TEAMS
                # Track Seed1, Div, Playoff success rates conditional on this game outcome
                for tid, seed in seed_map.items():
                    # Optimization: Only track relevant teams (Top 16? Seed < 16)
                    # Realistically only seed <= 14 matters for playoffs
                    if seed > 20: continue 

                    if tid not in tracker['deps']:
                        tracker['deps'][tid] = {
                            # Home Outcome Stats
                            'h_n': 0, 'h_s1': 0, 'h_wd': 0, 'h_mp': 0,
                            # Away Outcome Stats
                            'a_n': 0, 'a_s1': 0, 'a_wd': 0, 'a_mp': 0
                        }
                    
                    d = tracker['deps'][tid]
                    
                    # Logic to identify achievements
                    # seed is 1-indexed rank
                    # We need to know if they won division. `process_playoffs` returns map?
                    # `seed_map` is just {tid: seed}.
                    # I need `won_div` info. `process_playoffs` calculates it but maybe doesn't return it conveniently?
                    # Engine.process_playoffs returns `ranks` (dict).
                    # I might need to check `run_teams` structure or division rank?
                    # Actually `process_playoffs` in `engine.py` (lines ~100) does full sort.
                    # It returns `ranks` where `ranks[tid]` is seed.
                    # It doesn't explicitly flag "Won Division".
                    # Limitation: I'll assume Seed 1-4 = Won Division (mostly true, except crazy tiebreakers? No, 1-4 are div winners).
                    
                    is_s1 = (seed == 1)
                    is_wd = (seed <= 4) # Approximation: Top 4 seeds are div winners
                    is_mp = (seed <= 7)
                    
                    if outcome == 'home':
                        d['h_n'] += 1
                        if is_s1: d['h_s1'] += 1
                        if is_wd: d['h_wd'] += 1
                        if is_mp: d['h_mp'] += 1
                    else:
                        d['a_n'] += 1
                        if is_s1: d['a_s1'] += 1
                        if is_wd: d['a_wd'] += 1
                        if is_mp: d['a_mp'] += 1

            # Store Iteration Data for Scenario Analysis
            self.iteration_results.append({
                'outcomes': sim_outcomes,
                'seeds': seed_map
            })

        print(f"Simulated {ITERATIONS} in {time.time() - start_time:.2f}s")
        
        # --- Calculate Final Leverage & Clinch Scenarios ---
        leverage_results = []
        team_dependencies = {} 
        clinch_scenarios = {} # { tid: { 'seed1': [], 'division': [], 'playoff': [] } }
        seen_ids = set()
        
        for gid, t in game_tracker.items():
            if t['h_wins'] == 0 or t['a_wins'] == 0: continue
            
            # ... (Leverage Calc) ...
            
            # Process Dependencies
            # Dependencies handled later by Scenario Solver
            pass

            # Helper to get delta for a metric
            def get_delta(key_h_win, key_a_win, total_h, total_a):
                p_if_h = t[key_h_win] / total_h
                p_if_a = t[key_a_win] / total_a
                return abs(p_if_h - p_if_a)


            # Home Team Swings
            lev_h_made = get_delta('h_made_if_h', 'h_made_if_a', t['h_wins'], t['a_wins'])
            lev_h_bye  = get_delta('h_bye_if_h',  'h_bye_if_a',  t['h_wins'], t['a_wins'])
            lev_h_hf   = get_delta('h_hf_if_h',   'h_hf_if_a',   t['h_wins'], t['a_wins'])
            
            # Weighted Score for Home
            # Bye is HUGE (250%), Playoffs is Base (100%), Home Field is Bonus (50%)
            score_h = (lev_h_made * 100) + (lev_h_bye * 250) + (lev_h_hf * 50)
            
            # Away Team Swings
            lev_a_made = get_delta('a_made_if_h', 'a_made_if_a', t['h_wins'], t['a_wins'])
            lev_a_bye  = get_delta('a_bye_if_h',  'a_bye_if_a',  t['h_wins'], t['a_wins'])
            lev_a_hf   = get_delta('a_hf_if_h',   'a_hf_if_a',   t['h_wins'], t['a_wins'])
            
            score_a = (lev_a_made * 100) + (lev_a_bye * 250) + (lev_a_hf * 50)
            
            # Total Leverage Score
            total_lev = score_h + score_a
            
            # Divisional matchup bonus (50% more weight for division games)
            game = t['obj']
            ht = self.teams.get(game['homeId'], {})
            at = self.teams.get(game['awayId'], {})
            if ht.get('division') == at.get('division'):
                total_lev = total_lev * 1.5  # 50% bonus for divisional games
            
            if total_lev > 5: # Threshold (units are arbitrary score now, >5 is decent)
                # Lookup Teams
                game = t['obj']
                ht = self.teams.get(game['homeId'], {})
                at = self.teams.get(game['awayId'], {})
                h_abbr = ht.get('abbr', 'Home')
                a_abbr = at.get('abbr', 'Away')
                
                h_logo = ht.get('logo', '')
                a_logo = at.get('logo', '')
                
                game_name = f"{a_abbr} @ {h_abbr}"
                
                # Calculate Win Prob from Simulation Results
                total_sims_game = t['h_wins'] + t['a_wins']
                raw_home_prob = (t['h_wins'] / total_sims_game) * 100 if total_sims_game > 0 else 50.0
                
                # Force integer sum to 100
                home_win_prob = int(round(raw_home_prob))
                away_win_prob = 100 - home_win_prob
                
                # Colors
                from ..structure import TEAM_COLORS, TEAM_ALT_COLORS
                h_color = TEAM_COLORS.get(h_abbr, "#4a5568")
                a_color = TEAM_COLORS.get(a_abbr, "#4a5568") # Default to Primary
                
                # Check for color clash (e.g. KC vs TB)
                def hex_to_rgb(hex_str):
                    hex_str = hex_str.lstrip('#')
                    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

                def are_similar(c1, c2, threshold=100):
                    try:
                        r1, g1, b1 = hex_to_rgb(c1)
                        r2, g2, b2 = hex_to_rgb(c2)
                        dist = ((r2-r1)**2 + (g2-g1)**2 + (b2-b1)**2) ** 0.5
                        return dist < threshold
                    except:
                        return False

                if are_similar(h_color, a_color):
                     a_color = TEAM_ALT_COLORS.get(a_abbr, "#a0aec0") # Switch Away to Alt

                # Helper for specific text - now uses team's actual playoff probability
                def get_stake_desc(lev_made, lev_bye, lev_hf, team_playoff_prob, team_div_prob):
                    # 1. Playoff Survival (Most critical)
                    if 0 < team_playoff_prob < 25:
                        return "Playoff Survival"
                    
                    # 2. #1 Seed Chase (High Leverage on Bye)
                    if lev_bye > 0.15: # Lowered threshold slightly to catch more
                        return "Clinching #1 Seed"

                    # 3. Division Title (If not strictly clinched or just fighting for it)
                    if 0 < team_div_prob < 99.9 and (team_div_prob > 50 or lev_hf > 0.05):
                        return "Division Title"

                    # 4. Wild Card / Seeding
                    if lev_made > 0.08: 
                        return "Wild Card Race"
                    if lev_bye > 0.03: 
                        return "Seed Positioning"
                    if lev_made + lev_bye + lev_hf > 0.005: 
                        return "Seeding"
                    
                    # 5. Fallback
                    if team_div_prob >= 99.9: return "Seeding" # Clinched Div, low stakes
                    return "Pride"

                # Get team playoff probabilities from results (Convert to %)
                h_res = results.get(game['homeId'], {})
                a_res = results.get(game['awayId'], {})
                
                h_playoff_prob = (h_res.get('madePlayoffs', 0) / ITERATIONS) * 100
                a_playoff_prob = (a_res.get('madePlayoffs', 0) / ITERATIONS) * 100
                h_div_prob = (h_res.get('wonDivision', 0) / ITERATIONS) * 100
                a_div_prob = (a_res.get('wonDivision', 0) / ITERATIONS) * 100
                
                stake_h_text = get_stake_desc(lev_h_made, lev_h_bye, lev_h_hf, h_playoff_prob, h_div_prob)
                stake_a_text = get_stake_desc(lev_a_made, lev_a_bye, lev_a_hf, a_playoff_prob, a_div_prob)

                # Deduplication Check
                if gid in seen_ids: continue
                seen_ids.add(gid)

                leverage_results.append({
                    'id': gid,
                    'name': game_name,
                    'leverage': total_lev, 
                    'week': game.get('week', 99),
                    'home': h_abbr,
                    'away': a_abbr,
                    'home_logo': h_logo,
                    'away_logo': a_logo,
                    'home_win_prob': home_win_prob,
                    'away_win_prob': away_win_prob,
                    'home_color': h_color,
                    'away_color': a_color,
                    'stake_h_text': stake_h_text,
                    'stake_a_text': stake_a_text
                })

        # Sort by Total Leverage
        leverage_results.sort(key=lambda x: x['leverage'], reverse=True)
        
        # Filter to ONLY the next upcoming week (Simulate "This Week" Matchups only)
        if leverage_results:
            min_week = min(g['week'] for g in leverage_results)
            leverage_results = [g for g in leverage_results if g['week'] == min_week]

        results['top_games'] = leverage_results # Return all games for the slider
        # --- NEW SCENARIO SOLVER ---
        # Recursive Decision Tree to find complex clinch conditions
        
        # Helper to find splitting game
        def get_relevant_game(subset_idxs, tid):
            best_gid = None
            min_weighted_ent = 999.0
            
            for g in games_to_sim:
                gid = str(g['id'])
                
                # Split
                idxs_h = []
                idxs_a = []
                for i in subset_idxs:
                    o = self.iteration_results[i]['outcomes'].get(gid)
                    if o=='home': idxs_h.append(i)
                    elif o=='away': idxs_a.append(i)
                
                total = len(subset_idxs)
                n_h = len(idxs_h)
                n_a = len(idxs_a)
                
                if n_h == 0 or n_a == 0: continue # No split in this subset
                
                # Helper for Goal Entropy
                def wc_ent(idxs):
                    if not idxs: return 0
                    wins = 0
                    for k in idxs:
                        if self.iteration_results[k]['seeds'].get(tid, 99) <= 4: wins += 1
                    p = wins / len(idxs)
                    if p <= 0.001 or p >= 0.999: return 0
                    return 4 * p * (1 - p) # Gini-like impurity (max 1.0 at p=0.5)

                ent_h = wc_ent(idxs_h)
                ent_a = wc_ent(idxs_a)
                
                # Weighted Entropy
                w_ent = (n_h/total)*ent_h + (n_a/total)*ent_a
                
                # Bias: Prioritize Own Games
                if g['homeId'] == tid or g['awayId'] == tid:
                    w_ent -= 0.1 # Bias to favor own game even if both are perfect splits (0 entropy)
                
                if w_ent < min_weighted_ent:
                    min_weighted_ent = w_ent
                    best_gid = gid
            
            return best_gid

        def solve_clinch(subset_idxs, tid, depth=0):
            if not subset_idxs: return [False]
            
            # Check Success Rate
            success = 0
            for i in subset_idxs:
                if self.iteration_results[i]['seeds'].get(tid, 99) <= 4: # Division Winner
                    success += 1
            
            rate = success / len(subset_idxs)
            # print(f"DEBUG: Solve TID={tid} Depth={depth} N={len(subset_idxs)} Success={success} Rate={rate:.3f}")
            
            if rate >= 0.999: return [True]
            if rate <= 0.001: return [False]
            
            if depth >= 2: return [False] # Max depth
            
            gid = get_relevant_game(subset_idxs, tid)
            if not gid: 
                # print("DEBUG: No split game found!")
                return [False]
            
            idxs_h = [i for i in subset_idxs if self.iteration_results[i]['outcomes'].get(gid) == 'home']
            idxs_a = [i for i in subset_idxs if self.iteration_results[i]['outcomes'].get(gid) == 'away']
            
            res_h = solve_clinch(idxs_h, tid, depth+1)
            res_a = solve_clinch(idxs_a, tid, depth+1)
            
            # Combine
            scenarios = []
            g_obj = next((g for g in games_to_sim if str(g['id']) == gid), None)
            if not g_obj: return []
            
            ht = self.teams.get(g_obj['homeId'])
            at = self.teams.get(g_obj['awayId'])
            h_abbr = ht.get('abbr')
            a_abbr = at.get('abbr')

            def fmt(winner):
                if g_obj['homeId'] == tid:
                    return f"Win vs {a_abbr}" if winner=='home' else f"Loss vs {a_abbr}"
                elif g_obj['awayId'] == tid:
                    return f"Win @ {h_abbr}" if winner=='away' else f"Loss @ {h_abbr}"
                else:
                    return f"{h_abbr} beats {a_abbr}" if winner=='home' else f"{a_abbr} beats {h_abbr}"

            def merge(res, winner_code):
                root = fmt(winner_code)
                for r in res:
                    if r is True: scenarios.append(root)
                    elif r is False: continue
                    else: scenarios.append(f"{root} AND {r}")

            if any(res_h) and res_h != [False]: merge(res_h, 'home')
            if any(res_a) and res_a != [False]: merge(res_a, 'away')
            
            return scenarios

        # Execute Solver
        all_idxs = range(len(self.iteration_results))
        for tid, t in self.teams.items():
            # Check bounds first
            start_wins = sum(1 for i in all_idxs if self.iteration_results[i]['seeds'].get(tid,99) <= 4)
            if start_wins == 0 or start_wins == len(all_idxs): continue
            
            scens = solve_clinch(list(all_idxs), tid)
            valid_scens = [s for s in scens if isinstance(s, str)]
            
            if valid_scens:
                if tid not in clinch_scenarios: clinch_scenarios[tid] = {'seed1':[], 'division':[], 'playoff':[]}
                clinch_scenarios[tid]['division'] = valid_scens

        results['clinch_scenarios'] = clinch_scenarios
        
        # Sort Dependencies by Impact
        for tid in team_dependencies:
            team_dependencies[tid].sort(key=lambda x: x['diff'], reverse=True)
            
        results['team_dependencies'] = team_dependencies

        
        # --- Calculate Clinch Indicators (z, y, x, e) ---
        # Basic Sim-based indicators for raw results
        for tid, data in results.items():
            if not isinstance(data, dict): continue
            
            s1 = data.get('seed1', 0)
            div = data.get('wonDivision', 0)
            mp = data.get('madePlayoffs', 0)
            
            flag = ""
            # Strict thresholds for raw sim data
            # Logic here is just a placeholder, Views.py handles the real display logic
            if s1 >= 999: flag = "z"
            elif div >= 999: flag = "y"
            elif mp >= 999: flag = "x"
            elif mp <= 1: flag = "e"
            
            data['clinch_str'] = flag

        return results

        return results

    def process_playoffs(self, teams, results, h2h_matrix):
        seed_map = {}
        
        afc = [t for t in teams.values() if t['conference'] == 'AFC']
        nfc = [t for t in teams.values() if t['conference'] == 'NFC']
        
        s_afc = self.rank_conference(afc, results, h2h_matrix)
        s_nfc = self.rank_conference(nfc, results, h2h_matrix)
        
        seed_map.update(s_afc)
        seed_map.update(s_nfc)
        
        return seed_map

    def break_ties(self, tied_teams, h2h_matrix, level='division'):
        if len(tied_teams) <= 1: return tied_teams
        
        # 1. Head-to-Head
        ids = [t['id'] for t in tied_teams]
        
        # Calculate winning pct among tied teams
        # Wins inside the subset only
        local_recs = {tid: {'w':0, 'l':0} for tid in ids}
        
        for i, tid1 in enumerate(ids):
            for tid2 in ids[i+1:]:
                # Check H2H (tid1, tid2)
                wins1 = h2h_matrix.get((tid1, tid2), 0)
                wins2 = h2h_matrix.get((tid2, tid1), 0)
                
                local_recs[tid1]['w'] += wins1
                local_recs[tid1]['l'] += wins2
                local_recs[tid2]['w'] += wins2
                local_recs[tid2]['l'] += wins1

        def get_h2h_pct(t):
            r = local_recs[t['id']]
            tot = r['w'] + r['l']
            if tot == 0: return 0.0
            return r['w'] / tot

        tied_teams.sort(key=get_h2h_pct, reverse=True)
        best_pct = get_h2h_pct(tied_teams[0])
        # Group by best pct
        winners = [t for t in tied_teams if abs(get_h2h_pct(t) - best_pct) < 0.001]
        
        # If split occurred
        if len(winners) < len(tied_teams):
            return self.break_ties(winners, h2h_matrix, level) + self.break_ties([t for t in tied_teams if t not in winners], h2h_matrix, level)
            
        # 2. Division Record (if div tie)
        if level == 'division':
            def get_div_pct(t):
                r = t['divRecord']
                tot = r['wins'] + r['losses'] + r['ties']
                if tot == 0: return 0
                return (r['wins'] + r['ties']*0.5) / tot
            
            tied_teams.sort(key=get_div_pct, reverse=True)
            best_dp = get_div_pct(tied_teams[0])
            winners = [t for t in tied_teams if abs(get_div_pct(t) - best_dp) < 0.001]
            
            if len(winners) < len(tied_teams):
                return self.break_ties(winners, h2h_matrix, level) + self.break_ties([t for t in tied_teams if t not in winners], h2h_matrix, level)
        
        # 3. Conf Record
        def get_conf_pct(t):
            r = t['confRecord']
            tot = r['wins'] + r['losses'] + r['ties']
            if tot == 0: return 0
            return (r['wins'] + r['ties']*0.5) / tot
            
        tied_teams.sort(key=get_conf_pct, reverse=True)
        best_cp = get_conf_pct(tied_teams[0])
        winners = [t for t in tied_teams if abs(get_conf_pct(t) - best_cp) < 0.001]
            
        if len(winners) < len(tied_teams):
            return self.break_ties(winners, h2h_matrix, level) + self.break_ties([t for t in tied_teams if t not in winners], h2h_matrix, level)
            
        # 4. Fallback (Rating/NetPts)
        # Using live rating as proxy for SOV/Strength
        tied_teams.sort(key=lambda t: self.get_live_rating(t), reverse=True)
        return tied_teams

    def rank_conference(self, conf_teams, results, h2h_matrix):
        # Group by Div
        divs = {}
        for t in conf_teams:
            d = t['division']
            if d not in divs: divs[d] = []
            divs[d].append(t)
            
        div_winners = []
        wildcards = []
        local_seeds = {}
        
        for dname, dteams in divs.items():
            if not dteams: continue
            
            # Sort by Win Pct PURELY first
            dteams.sort(key=lambda x: self.get_win_pct(x), reverse=True)
            
            # Group Logic
            ranked_div = []
            curr_grp = [dteams[0]]
            for t in dteams[1:]:
                if abs(self.get_win_pct(t) - self.get_win_pct(curr_grp[0])) < 0.001:
                    curr_grp.append(t)
                else:
                    ranked_div.extend(self.break_ties(curr_grp, h2h_matrix, 'division'))
                    curr_grp = [t]
            ranked_div.extend(self.break_ties(curr_grp, h2h_matrix, 'division'))
            
            winner = ranked_div[0]
            div_winners.append(winner)
            results[winner['id']]['wonDivision'] += 1
            
            for wc in ranked_div[1:]:
                wildcards.append(wc)
                
        # Sort Div Winners (Seeds 1-4) using Conf Tiebreakers
        div_winners.sort(key=lambda x: self.get_win_pct(x), reverse=True)
        final_winners = []
        if div_winners:
            curr_grp = [div_winners[0]]
            for t in div_winners[1:]:
                if abs(self.get_win_pct(t) - self.get_win_pct(curr_grp[0])) < 0.001:
                    curr_grp.append(t)
                else:
                     final_winners.extend(self.break_ties(curr_grp, h2h_matrix, 'conference'))
                     curr_grp = [t]
            final_winners.extend(self.break_ties(curr_grp, h2h_matrix, 'conference'))
        
        for idx, t in enumerate(final_winners):
            s = idx + 1
            self.record_seed(results, t['id'], s)
            local_seeds[t['id']] = s
            
        # Sort Wildcards
        wildcards.sort(key=lambda x: self.get_win_pct(x), reverse=True)
        final_wc = []
        if wildcards:
            curr_grp = [wildcards[0]]
            for t in wildcards[1:]:
                if abs(self.get_win_pct(t) - self.get_win_pct(curr_grp[0])) < 0.001:
                    curr_grp.append(t)
                else:
                     final_wc.extend(self.break_ties(curr_grp, h2h_matrix, 'conference'))
                     curr_grp = [t]
            final_wc.extend(self.break_ties(curr_grp, h2h_matrix, 'conference'))
        
        # Assign Seeds 5,6,7
        offset = len(final_winners)
        for idx, t in enumerate(final_wc):
             s = offset + 1 + idx
             if s <= 7:
                 self.record_seed(results, t['id'], s)
                 local_seeds[t['id']] = s
        
        return local_seeds

    def get_pct(self, rec):
        t = rec['wins'] + rec['losses'] + rec['ties']
        return (rec['wins'] + 0.5 * rec['ties']) / t if t > 0 else 0.5

    def get_h2h_wins(self, team_id, opponent_ids):
        """Calculate total head-to-head wins against a list of opponents"""
        total_wins = 0
        for opp_id in opponent_ids:
            if team_id != opp_id:
                total_wins += self.h2h_records.get((team_id, opp_id), 0)
        return total_wins

    def get_div_sort_key(self, team, div_teams_ids):
        # Tiebreakers: 1. Win Pct, 2. Div Win Pct (Dynamic), 3. Conf Win Pct, 4. Random
        # Removed static H2H check to avoid locking in historical results
        wp = self.get_win_pct(team)
        dwp = self.get_pct(team['divRecord'])
        cwp = self.get_pct(team['confRecord'])
        return (wp, dwp, cwp, random.random())

    def get_wc_sort_key(self, team):
        # Tiebreakers: 1. Win Pct, 2. Conf Win Pct, 3. Random
        wp = self.get_win_pct(team)
        cwp = self.get_pct(team['confRecord'])
        dwp = self.get_pct(team['divRecord']) # Fallback
        return (wp, cwp, dwp, random.random())

    def get_win_score(self, team):
        # Fallback numeric score for generic cases
        return self.get_wc_sort_key(team)

    def record_seed(self, results, tid, seed):
        results[tid]['madePlayoffs'] += 1
        k = f"seed{seed}"
        if k in results[tid]:
            results[tid][k] += 1

    def simulate_postseason(self, seed_map, run_teams):
        # 1. Expand seeds to objects
        # seed_map: { tid: seed_int }
        # Sort by seed
        afc_seeds = []
        nfc_seeds = []
        
        for tid, seed in seed_map.items():
            team = run_teams.get(tid)
            if not team: continue
            if team['conference'] == 'AFC':
                afc_seeds.append((seed, team))
            else:
                nfc_seeds.append((seed, team))
                
        afc_seeds.sort(key=lambda x: x[0])
        nfc_seeds.sort(key=lambda x: x[0])
        
        # Helper to sim game
        def sim_game(t1, t2):
            # t1 is home/better seed? 
            # In playoffs, better seed hosts.
            # Compare rating
            r1 = self.get_live_rating(t1)
            r2 = self.get_live_rating(t2)
            # Home field
            spread = r1 - r2 + HOME_ADVANTAGE
            prob1 = 1 / (1 + 10 ** -(spread / 16))
            
            if random.random() < prob1: return t1
            return t2

        def sim_conf(seeds):
            # Seeds is list of (seed_num, team_obj)
            # Need strict 7 teams
            if len(seeds) < 7: return None # Should not happen in full sim
            
            # Wild Card Round
            # 1 Bye
            # 2 vs 7, 3 vs 6, 4 vs 5
            # Winners
            winners = [seeds[0][1]] # #1 advances
            
            # 2 vs 7
            w_27 = sim_game(seeds[1][1], seeds[6][1])
            winners.append(w_27)
            
            # 3 vs 6
            w_36 = sim_game(seeds[2][1], seeds[5][1])
            winners.append(w_36)
            
            # 4 vs 5
            w_45 = sim_game(seeds[3][1], seeds[4][1])
            winners.append(w_45)
            
            # Divisional Round
            # Reseeding: #1 plays lowest seed remaining
            # Sort winners by original seed
            # We map back to find their seed? 
            # We can lookup in dict or just use the fact they are team objs.
            # Let's verify seed from map
            win_seeds = []
            for w in winners:
                s = seed_map[w['id']]
                win_seeds.append((s, w))
            
            win_seeds.sort(key=lambda x: x[0])
            
            # Matchups: 
            # #1 (win_seeds[0]) vs Lowest (win_seeds[3])
            # #2 Remaining (win_seeds[1]) vs #3 Remaining (win_seeds[2])
            
            finalists = []
            # 1 vs 4
            f1 = sim_game(win_seeds[0][1], win_seeds[3][1])
            finalists.append(f1)
            
            # 2 vs 3
            f2 = sim_game(win_seeds[1][1], win_seeds[2][1])
            finalists.append(f2)
            
            # Conf Championship
            # Better seed hosts.
            s1 = seed_map[finalists[0]['id']]
            s2 = seed_map[finalists[1]['id']]
            
            # Sort by seed to determine home
            champ_match = sorted([(s1, finalists[0]), (s2, finalists[1])], key=lambda x: x[0])
            
            conf_champ = sim_game(champ_match[0][1], champ_match[1][1])
            return conf_champ

        afc_champ = sim_conf(afc_seeds)
        nfc_champ = sim_conf(nfc_seeds)
        
        if afc_champ and nfc_champ:
            # Super Bowl
            # Neutral Site roughly (Home Advantage 0? or biased to one side? Let's say neutral)
            # Using rating only
            ra = self.get_live_rating(afc_champ)
            rn = self.get_live_rating(nfc_champ)
            spread = ra - rn # No home advantage
            prob_a = 1 / (1 + 10 ** -(spread / 16))
            
            if random.random() < prob_a: return afc_champ
            return nfc_champ
            
        return None
