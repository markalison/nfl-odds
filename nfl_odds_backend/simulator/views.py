from django.shortcuts import render, redirect
from django.views.decorators.http import require_http_methods
import json
from .services.espn import DataService
from .services.engine import SimulationEngine

# Simple In-Memory Cache (Global State)
DATA_CACHE = {
    "teams": {},
    "schedule": [],
    "last_updated": 0
}

def get_bg_color(value):
    # Python version of the JS color logic (Navy Theme)
    # val is 0-1000, convert to 0-100
    p_val = (value / 1000) * 100
    
    if p_val >= 100: return '#2c5282', 'white'
    if p_val <= 0: return '#ffffff', '#ccc'
    
    # Simple interpolation
    if p_val < 50:
        # White (255,255,255) -> Light Blue (144, 205, 244)
        fac = p_val / 50
        r = int(255 + (144 - 255) * fac)
        g = int(255 + (205 - 255) * fac)
        b = int(255 + (244 - 255) * fac)
        text = 'black'
    else:
        # Light Blue -> Navy (44, 82, 130)
        fac = (p_val - 50) / 50
        r = int(144 + (44 - 144) * fac)
        g = int(205 + (82 - 205) * fac)
        b = int(244 + (130 - 244) * fac)
        text = 'white' if p_val > 80 else 'black'
        
    return f'rgb({r},{g},{b})', text

def index(request):
    """
    GET /
    Main SSR View. Handles filtering, sorting, and simulation.
    """
    global DATA_CACHE
    
    import time
    
    # 1. Initialize/Refresh Data if Cache is Stale (60 seconds)
    current_time = time.time()
    if not DATA_CACHE["teams"] or (current_time - DATA_CACHE["last_updated"] > 60):
        print("Cache stale, fetching fresh data...")
        service = DataService()
        data = service.get_data()
        DATA_CACHE["teams"] = data["teams"]
        DATA_CACHE["schedule"] = data["schedule"]
        DATA_CACHE["last_updated"] = current_time

    # 2. Handle Session Overrides
    # format: overrides = {'gameId': 'home'|'away'|'tie'}
    overrides = request.session.get('overrides', {})
    
    # Logic: Only keep overrides if we are in an "Active Simulation" (query param sim_active=1)
    # OR if we are currently performing an action (which will then redirect to active).
    # If standard load (no action, no active flag), we clear state.
    is_sim_active = request.GET.get('sim_active') == '1'
    has_action = request.GET.get('action')
    
    if not is_sim_active and not has_action:
        overrides = {}
        request.session['overrides'] = {}

    # helper: find next unplayed game(s) for a team
    def get_games_for_team(team_id, schedule):
        # Return list of unplayed games sorted by date (assuming schedule is sorted or close enough)
        # We need to verify 'completed' flag
        team_games = []
        for g in schedule:
            if not g.get('completed') and (g['homeId'] == team_id or g['awayId'] == team_id):
                team_games.append(g)
        # Explicitly sort by Week to guarantee order
        team_games.sort(key=lambda x: x.get('week', 99))
        return team_games

    # Handle Actions
    # ?action=win_next&team=BUF
    action = request.GET.get('action')
    target_team = request.GET.get('team')
    
    if action and target_team:
        team_games = get_games_for_team(target_team, DATA_CACHE["schedule"])
        if team_games:
            # "Next" game is the first one in the list (assuming chronological order in cache)
            next_game = team_games[0]
            gid = str(next_game['id'])
            
            # Determine value to set based on action
            val_to_set = None
            if action == 'win_next':
                val_to_set = 'home' if next_game['homeId'] == target_team else 'away'
            elif action == 'lose_next':
                val_to_set = 'away' if next_game['homeId'] == target_team else 'home'
            elif action == 'tie_next':
                val_to_set = 'tie'
            
            # Application Logic (Toggle vs Set)
            if val_to_set:
                # If current override matches, remove it (Toggle Off)
                if overrides.get(gid) == val_to_set:
                    overrides.pop(gid, None)
                else:
                    overrides[gid] = val_to_set
            
            elif action == 'win_out':
                # Toggle Logic for Win Out
                # Check if currently fully won out
                is_already_won_out = True
                for g in team_games:
                    g_id_str = str(g['id'])
                    v = 'home' if g['homeId'] == target_team else 'away'
                    if overrides.get(g_id_str) != v:
                        is_already_won_out = False
                        break
                
                if is_already_won_out:
                    # Toggle Off: Clear these overrides
                    for g in team_games:
                        g_id_str = str(g['id'])
                        overrides.pop(g_id_str, None)
                else:
                    # Toggle On: Set all to win
                    for g in team_games:
                        g_id_str = str(g['id'])
                        v = 'home' if g['homeId'] == target_team else 'away'
                        overrides[g_id_str] = v

            elif action == 'reset':
                overrides = {}
                request.session['overrides'] = {}
                base_url = request.path
                q_filter = request.GET.get('filter', 'league')
                q_sort = request.GET.get('sort', 'madePlayoffs')
                # Reset redirects to clean URL (removes sim_active)
                return redirect(f"{base_url}?filter={q_filter}&sort={q_sort}")
                
        request.session['overrides'] = overrides
        # Clean Redirect (BUT Keep sim_active=1 to persist state)
        base_url = request.path
        q_filter = request.GET.get('filter', 'league')
        q_sort = request.GET.get('sort', 'madePlayoffs')
        return redirect(f"{base_url}?filter={q_filter}&sort={q_sort}&sim_active=1")

    # 3. Logic: Static Leverage & Caching
    
    # A. Static Leverage (Calculated once at startup/first load)
    if "baseline_leverage" not in DATA_CACHE:
        # Run a baseline sim with NO overrides to establish true game importance
        print("Running Baseline Simulation for Leverage...")
        sim_base = SimulationEngine(DATA_CACHE["teams"], DATA_CACHE["schedule"])
        results_base = sim_base.run({})
        DATA_CACHE["baseline_leverage"] = results_base.get('top_games', [])
        
    # B. Caching Simulation Results to prevent jitter & handle fluctuation
    # Create a deterministic key from the current overrides
    sim_key = json.dumps(overrides, sort_keys=True)
    
    # Initialize cache dict if not present
    if "sim_cache" not in DATA_CACHE:
        DATA_CACHE["sim_cache"] = {}
        
    results = {}
    
    # Check Cache
    if sim_key in DATA_CACHE["sim_cache"]:
        # print("Using Cached Simulation Results")
        results = DATA_CACHE["sim_cache"][sim_key]
    else:
        # Run New Simulation
        # print(f"Running New Simulation (Overrides: {len(overrides)})...")
        sim = SimulationEngine(DATA_CACHE["teams"], DATA_CACHE["schedule"])
        results = sim.run(overrides)
        
        # Update Cache (Limit size ideally, but 1000 iter is small enough for now)
        DATA_CACHE["sim_cache"][sim_key] = results
    
    # 4. Filter & Sort Logic
    current_filter = request.GET.get('filter', 'league')
    sort_col = request.GET.get('sort', 'madePlayoffs')
    sort_desc = True
    
    # Math Engine Init
    from .services.math_engine import MathEngine
    eng_m = MathEngine(DATA_CACHE['teams'], DATA_CACHE['schedule'])
    math_bounds = eng_m.get_team_bounds()
    math_status_map = eng_m.check_status(math_bounds)

    # DEBUG: Print Math Status Sample
    print(f"[DEBUG] Math Status Map Sample (Limit 5): {list(math_status_map.items())[:5]}")

    team_list = []
    
    for tid, team in DATA_CACHE['teams'].items():
        include = True # Filtering init
        res = results.get(tid, {})
        
        # Get math engine status (source of truth for eliminated/clinched)
        m_stat = math_status_map.get(tid, 'alive')
        
        # Calculate display values
        seed1 = res.get('seed1', 0)
        make_playoffs = res.get('madePlayoffs', 0)
        won_div = res.get('wonDivision', 0)
        won_sb = res.get('wonSuperBowl', 0)
        
        # Force 0% for mathematically eliminated teams (overrides simulation noise)
        if m_stat == 'eliminated_playoff':
            seed1 = 0
            make_playoffs = 0
            won_div = 0
            won_sb = 0
        
        # Color calcs
        bg_s1, txt_s1 = get_bg_color(seed1)
        bg_mp, txt_mp = get_bg_color(make_playoffs)
        bg_wd, txt_wd = get_bg_color(won_div)
        bg_sb, txt_sb = get_bg_color(won_sb)


        # Math Indicators (m_stat already defined above)
        clinch_flag = ""
        if seed1 >= 999: clinch_flag = "z"
        elif math_status_map.get(f"{tid}_div_clinched"): clinch_flag = "y"
        elif m_stat == 'clinched_playoff': clinch_flag = "x"
        elif m_stat == 'eliminated_playoff' or make_playoffs == 0: clinch_flag = "e"
        
        # DEBUG SPECIFIC TEAM
        if team['abbr'] in ['DAL', 'NE', 'PHI', 'KC', 'CAR', 'ATL']:
            print(f"[DEBUG] {team['abbr']} -> SimS1:{seed1} SimMp:{make_playoffs} MathStat:{m_stat} -> Flag:'{clinch_flag}'")
            # Also log math bounds if available
            t_bounds = math_bounds.get(tid, {})
            print(f"        Bounds: curr={t_bounds.get('curr')} max={t_bounds.get('max')} threshold_elim_debug={math_status_map.get('threshold_elim_nfc' if team['conference']=='NFC' else 'threshold_elim_afc')}")
        
        # Format text - show 0% for eliminated teams, not <1%
        def start_fmt(val, is_eliminated=False):
            if is_eliminated:
                return '0%'
            p = (val/1000)*100
            if p == 100: return '100%'
            if p == 0: return '0%'
            if p > 99.9: return '>99%'
            if p < 0.1: return '<1%'
            return f"{p:.1f}%"
        
        is_eliminated = (m_stat == 'eliminated_playoff')
        
        # Determine Override State for Next Game (for UI highlights)
        next_game_status = 'none'
        # Extra details for tooltip
        next_opp_abbr = 'BYE'
        next_week_num = ''

        # Win Out Logic: Default False. Only True if games exist AND all are overridden to win.
        is_win_out = False 
        
        tgames = get_games_for_team(tid, DATA_CACHE["schedule"])
        if tgames:
            ng = tgames[0]
            nid = str(ng['id'])
            
            # Opponent Info
            opp_id = ng['homeId'] if ng['awayId'] == tid else ng['awayId']
            opp_obj = DATA_CACHE['teams'].get(opp_id, {})
            next_opp_abbr = opp_obj.get('abbr', '???')
            next_week_num = ng.get('week', '')
            
            if nid in overrides:
                pick = overrides[nid]
                if pick == 'tie': next_game_status = 'tie'
                elif pick == 'home' and ng['homeId'] == tid: next_game_status = 'win'
                elif pick == 'away' and ng['awayId'] == tid: next_game_status = 'win'
                else: next_game_status = 'loss'
            
            # Check Win Out Status
            all_wins = True
            for g in tgames:
                gid = str(g['id'])
                if gid not in overrides:
                    all_wins = False
                    break
                
                pick = overrides[gid]
                if pick == 'tie':
                    all_wins = False
                    break
                
                # Check if pick is a win for this team
                is_home = (g['homeId'] == tid)
                if is_home and pick != 'home':
                    all_wins = False
                    break
                if not is_home and pick != 'away':
                    all_wins = False
                    break
            
            if all_wins:
                is_win_out = True
        else:
            is_win_out = False # No games left

        # DEFINE TEAM OBJECT EARLY
        t_obj = {
            'obj': team,
            'id': team['id'],
            'name': team['name'],
            'logo': team['logo'],
            'record': team['record'],
            'record_str': f"{team['record']['wins']}-{team['record']['losses']}" + (f"-{team['record']['ties']}" if team['record']['ties'] else ""),
            'conference': team['conference'],
            'division': team['division'],
            'next_status': next_game_status,
            'next_opp': next_opp_abbr,
            'next_week': next_week_num,
            'is_win_out': is_win_out,
            'conf_div_str': f"{team['conference']} {team['division'].split(' ')[1] if ' ' in team['division'] else team['division']}",
            # Stats
            'seed1': seed1,
            'wonDivision': won_div,
            'madePlayoffs': make_playoffs,
            'wonSuperBowl': won_sb,
            # Display
            'seed1_str': start_fmt(seed1, is_eliminated),
            'wonDivision_str': start_fmt(won_div, is_eliminated),
            'madePlayoffs_str': start_fmt(make_playoffs, is_eliminated),
            'wonSuperBowl_str': start_fmt(won_sb, is_eliminated),
            'seed1_bg': bg_s1, 'seed1_txt': txt_s1,
            'madePlayoffs_bg': bg_mp, 'madePlayoffs_txt': txt_mp,
            'wonDivision_bg': bg_wd, 'wonDivision_txt': txt_wd,
            'wonSuperBowl_bg': bg_sb, 'wonSuperBowl_txt': txt_sb,
            # Expansion
            'show_graph': False, # Update below
            'graph_svg': "",
            'clinch_str': clinch_flag
        }
        # Expand Graph Logic
        expand_team = request.GET.get('expand_team')
        show_graph = (expand_team == str(tid)) # Ensure string comparison
        t_obj['show_graph'] = show_graph
        graph_svg = ""
        
        if show_graph:
            # DETERMINISTIC Scenario Analysis (No Monte Carlo)
            # Get mathematical playoff scenario from MathEngine
            math_scenario = eng_m.get_playoff_scenarios(tid, math_bounds)
            
            # Inject Logo URLs for scenarios
            if math_scenario.get('details'):
                for item in math_scenario['details']:
                    if item.get('team_id'):
                        t_data = DATA_CACHE['teams'].get(item['team_id'])
                        if t_data:
                            item['logo'] = t_data.get('logo')
            
            scenario_data = {
                "math_status": math_scenario['status'],
                "math_message": math_scenario['message'],
                "math_details": math_scenario['details'],
                "max_wins": math_scenario['max_wins'],
                "min_wins": math_scenario['min_wins'],
                "current_wins": math_scenario['current_wins'],
                "remaining_games": math_scenario['remaining_games'],
                "guaranteed_ahead": math_scenario['guaranteed_ahead'],
                "behind_us": math_scenario['behind_us'],
                "in_contention": math_scenario['in_contention'],
                # Legacy fields for backwards compat
                "rooting_guide": [],
                "clinch_seed1": [],
                "clinch_division": [],
                "clinch_playoff": []
            }

            t_obj['scenario_data'] = scenario_data
            
            graph_svg = "" # Disable SVG


    # Sorting
    # Sorting Helper
        if current_filter == 'conf':
            pass 
        elif current_filter == 'div':
            pass
        elif current_filter.startswith('conf-'):
            c = current_filter.split('-')[1]
            if team['conference'] != c: include = False
        
        # Debug Clinch Values
        if seed1 > 900 or make_playoffs > 900 or make_playoffs < 100:
             print(f"[DEBUG] {team['abbr']}: S1={seed1} DIV={won_div} MP={make_playoffs} -> STR='{t_obj['clinch_str']}'")

        if include:
            team_list.append(t_obj)

    # Sorting
    # Sorting Helper
    def get_sort_val(item, col):
        if col == 'record':
            # Calculate Win %
            rec = item['record']
            total = rec['wins'] + rec['losses'] + rec['ties']
            if total == 0: return 0
            return (rec['wins'] + 0.5 * rec['ties']) / total
        return item.get(col, 0)
    
    # Primary Group Sort
    if current_filter == 'conf':
        # Sort by Conf, then SortCol
        team_list.sort(key=lambda x: (x['conference'], get_sort_val(x, sort_col)), reverse=(sort_desc if sort_col!='conference' else False)) 
        # Note: We need complex sort. Python sort is stable.
        # Let's sort by secondary (desc) first, then primary (asc).
        team_list.sort(key=lambda x: get_sort_val(x, sort_col), reverse=True)
        team_list.sort(key=lambda x: x['conference'])
        
    elif current_filter == 'div':
        team_list.sort(key=lambda x: get_sort_val(x, sort_col), reverse=True)
        team_list.sort(key=lambda x: x['division'])
    else:
        # League
        team_list.sort(key=lambda x: get_sort_val(x, sort_col), reverse=True)

    # Group Header Logic for Template
    # We'll rely on {% ifchanged %} in template, just need to ensure sorted order is correct.
    
    # --- Helper: Advanced Classic Score ---
    # --- Helper: Advanced Classic Score ---
    def calc_classic_score(g):
        home_score = g['homeScore']
        away_score = g['awayScore']
        diff = abs(home_score - away_score)
        total = home_score + away_score

        # Team Context
        ht = DATA_CACHE['teams'].get(g['homeId'], {})
        at = DATA_CACHE['teams'].get(g['awayId'], {})
        
        # Quality
        def get_pct(t):
            r = t.get('record', {})
            w = r.get('wins', 0)
            l = r.get('losses', 0)
            ti = r.get('ties', 0)
            if (w+l+ti) == 0: return 0.5
            return (w + 0.5*ti) / (w+l+ti)
        
        qual_score = (get_pct(ht) + get_pct(at)) * 200

        # Rivalry
        is_div = (ht.get('conference') == at.get('conference') and ht.get('division') == at.get('division'))
        rivalry = 150 if is_div else 0
        
        # 1. Closeness Base (Exponential)
        base_closeness = 800 / (diff + 1)
        
        # 2. High Score Bonus
        score_bonus = total * 3
        
        # 3. Overtime Bonus
        ot_bonus = 0
        if g.get('period', 0) > 4:
            ot_bonus = 500
        
        # 4. Comeback Factor
        comeback_bonus = 0
        h_lines = g.get('homeLines', [])
        a_lines = g.get('awayLines', [])
        if len(h_lines) >= 3 and len(a_lines) >= 3:
            h_q3 = sum(h_lines[:3])
            a_q3 = sum(a_lines[:3])
            if home_score > away_score and a_q3 > h_q3:
                comeback_bonus = (a_q3 - h_q3) * 25
            elif away_score > home_score and h_q3 > a_q3:
                comeback_bonus = (h_q3 - a_q3) * 25

        # 5. Wild Finish (High Scoring Q4)
        wild_finish_bonus = 0
        if len(h_lines) >= 4 and len(a_lines) >= 4:
            q4_total = h_lines[3] + a_lines[3]
            if q4_total >= 21:
                wild_finish_bonus = q4_total * 10
        
        final_score = base_closeness + qual_score + rivalry + score_bonus + ot_bonus + comeback_bonus + wild_finish_bonus
        return int(final_score)

    # --- Recent Games Logic (Rotates on Thursday) ---
    recent_games = []
    last_week_number = ""
    recent_header = ""
    
    if DATA_CACHE["schedule"]:
        schedule = DATA_CACHE["schedule"]
        unplayed = [g for g in schedule if not g.get('completed')]
        completed = [g for g in schedule if g.get('completed')]
        
        target_week = None
        
        if unplayed:
            # Current week is the first week with unplayed games
            current_week = min([g.get('week', 100) for g in unplayed])
            
            # CHECK: Do we have completed games for this current week? (e.g. Thursday Night)
            current_week_completed = [g for g in completed if g.get('week') == current_week]
            
            if current_week_completed:
                # Yes! Show THIS week's games (Thursday Night + others as they finish)
                target_week = current_week
            else:
                # No games played this week yet, show LAST full week
                target_week = current_week - 1
        elif completed:
            # Season over, show last played week
            target_week = max([g.get('week', 0) for g in completed])
            
        if target_week and target_week > 0:
            last_week_number = target_week
            recent_header = f"(Week {last_week_number})"
            # Filter for this week
            last_week_games = [g for g in completed if g.get('week') == target_week]
            
            # Enrich and Sort
            enriched = []
            for g in last_week_games:
                score_val = calc_classic_score(g)
                
                ht = DATA_CACHE['teams'].get(g['homeId'], {})
                at = DATA_CACHE['teams'].get(g['awayId'], {})
                
                enriched.append({
                    'id': g['id'],
                    'name': f"{at.get('abbr', 'Away')} @ {ht.get('abbr', 'Home')}",
                    'home_abbr': ht.get('abbr'),
                    'away_abbr': at.get('abbr'),
                    'home_logo': ht.get('logo'),
                    'away_logo': at.get('logo'),
                    'home_score': g['homeScore'],
                    'away_score': g['awayScore'],
                    'score': f"{g['awayScore']} - {g['homeScore']}",
                    'classic_score': score_val,
                    'week': target_week
                })
            
            # Sort by Classic Score Descending
            enriched.sort(key=lambda x: x['classic_score'], reverse=True)
            recent_games = enriched[:5]

    # Helper to get seeded teams for a conference
    def get_conference_seeds(conf_name, all_teams):
        conf_teams = [t for t in all_teams if t['conference'] == conf_name]
        
        # 1. Identify Division Winners
        # Group by division
        divisions = {}
        for t in conf_teams:
            div = t['division']
            if div not in divisions: divisions[div] = []
            divisions[div].append(t)
            
        div_winners = []
        for div, teams in divisions.items():
            # Find team with max wonDivision probability
            best_team = max(teams, key=lambda x: x['wonDivision'])
            div_winners.append(best_team)
            
        # Sort Division Winners (1-4) by seed1 probability (primary) then madePlayoffs (secondary)
        div_winners.sort(key=lambda x: (x['seed1'], x['madePlayoffs']), reverse=True)
        
        # 2. Identify Wild Cards
        # Get all other teams not in div_winners
        winner_ids = set(t['id'] for t in div_winners)
        others = [t for t in conf_teams if t['id'] not in winner_ids]
        
        # Sort others by madePlayoffs
        others.sort(key=lambda x: x['madePlayoffs'], reverse=True)
        
        # Top 3 are wild cards
        wild_cards = others[:3]
        
        # Combine
        return div_winners + wild_cards

    afc_seeds = get_conference_seeds('AFC', team_list)
    nfc_seeds = get_conference_seeds('NFC', team_list)
    
    # Padding Helper
    def pad_seeds(seeds):
        while len(seeds) < 7:
            seeds.append({
                'name': 'TBD',
                'logo': 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/nfl.png', # Generic NFL logo
                'record_str': '',
                'clinched': False,
                'clinch_str': ''
            })
        return seeds
        
    afc_seeds = pad_seeds(afc_seeds)
    nfc_seeds = pad_seeds(nfc_seeds)
    
    # Mark clinched teams
    for t in afc_seeds + nfc_seeds:
        t['clinched'] = (t.get('clinch_str', '') in ['x', 'y', 'z'])
    
    # Still Alive: all teams with madePlayoffs > 0 (not eliminated)
    alive_teams = [t for t in team_list if t['madePlayoffs'] > 0]
    alive_teams.sort(key=lambda x: x['madePlayoffs'], reverse=True)
    
    # Filter out teams that are already in the bracket
    afc_seed_ids = set(t['id'] for t in afc_seeds if 'id' in t)
    nfc_seed_ids = set(t['id'] for t in nfc_seeds if 'id' in t)
    
    alive_afc = [t for t in alive_teams if t['conference'] == 'AFC' and t['id'] not in afc_seed_ids]
    alive_nfc = [t for t in alive_teams if t['conference'] == 'NFC' and t['id'] not in nfc_seed_ids]
    
    # Add abbr for display
    for t in alive_teams:
        t['abbr'] = t['obj'].get('abbr', t['name'][:3].upper())

    context = {
        'teams': team_list,
        'filter': current_filter,
        'sort': sort_col,
        'top_games': DATA_CACHE.get('baseline_leverage', []),
        'recent_games': recent_games,
        'last_week_number': str(last_week_number),
        'recent_header': recent_header,
        'afc_seeds': afc_seeds,
        'nfc_seeds': nfc_seeds,
        'alive_afc': alive_afc,
        'alive_nfc': alive_nfc
    }

    # --- Key Updates (The Wire: This Week Only) ---
    import copy # Ensure copy is available
    updates = []
    
    # We need to compare "Current Reality" (No Overrides) vs "Start of Week Reality"
    target_week_updates = last_week_number # Using the logic from Recent Games
    
    if target_week_updates:
        # 1. Get Current Baseline (Actual Reality)
        # We might have cached this in baseline_leverage but that only has top_games.
        # We need full results. Rerunning clean sim is safer/easier.
        sim_curr = SimulationEngine(DATA_CACHE["teams"], DATA_CACHE["schedule"])
        res_curr = sim_curr.run({}) # No overrides
        
        # 2. Construct "Start of Week" State
        teams_prev = copy.deepcopy(DATA_CACHE["teams"])
        schedule_prev = copy.deepcopy(DATA_CACHE["schedule"])
        
        # Identify games to revert (Completed games from this week)
        games_to_revert = [g for g in schedule_prev if g.get('week') == target_week_updates and g.get('completed')]
        
        for g in games_to_revert:
            # Revert Game Status
            g['completed'] = False
            
            # Revert Team Records
            # Logic: Identify winner, subtract win/loss
            h_score = g['homeScore']
            a_score = g['awayScore']
            
            hid = g['homeId']
            aid = g['awayId']
            
            ht = teams_prev.get(hid)
            at = teams_prev.get(aid)
            
            if ht and at:
                # Basic Record Reversion
                is_tie = (h_score == a_score)
                home_won = (h_score > a_score)
                
                # Helper to decrement
                def decrement(record, key):
                    if key in record and record[key] > 0:
                        record[key] -= 1
                        
                if is_tie:
                    decrement(ht['record'], 'ties')
                    decrement(at['record'], 'ties')
                elif home_won:
                    decrement(ht['record'], 'wins')
                    decrement(at['record'], 'losses')
                else:
                    decrement(ht['record'], 'losses')
                    decrement(at['record'], 'wins')
                    
                # Note: Division/Conference records should also be reverted if applicable
                # For now, relying on Basic Record as sim engine primarily uses that for W/L pct
                # If Sim Engine uses div record for tiebreakers, we should revert that too.
                # Simplified for safety: The Sim v2 uses record primarily.
        
        # 3. Run Previous Sim
        sim_prev = SimulationEngine(teams_prev, schedule_prev)
        res_prev = sim_prev.run({})
        
        # 4. Compare & Generate Updates
        sorted_teams = sorted(DATA_CACHE['teams'].values(), key=lambda x: x.get('conference'))
        
        for team in sorted_teams:
            tid = team['id']
            name = team.get('abbr', team['name'])
            logo = team.get('logo', '')
            
            # Current
            curr = res_curr.get(tid, {})
            c_mp = curr.get('madePlayoffs', 0)
            c_wd = curr.get('wonDivision', 0)
            c_s1 = curr.get('seed1', 0)
            
            # Previous
            prev = res_prev.get(tid, {})
            p_mp = prev.get('madePlayoffs', 0)
            p_wd = prev.get('wonDivision', 0)
            p_s1 = prev.get('seed1', 0)
            
            # Logic: Changed from <999 to >=999 (Clinched)
            # Or >1 to <=1 (Eliminated)
            # REMOVED NOISE FILTER: User prefers strictly reporting the crossing of thresholds.
            
            IS_CLINCHED = 999
            IS_ELIM = 1
            
            if c_mp >= IS_CLINCHED and p_mp < IS_CLINCHED:
                if c_s1 >= IS_CLINCHED:
                    if p_s1 < IS_CLINCHED: # Only if specific seed change
                         updates.append({
                            "type": "good", 
                            "abbr": name,
                            "logo": logo,
                            "msg": "Clinched #1 Seed"
                        })
                elif c_wd >= IS_CLINCHED and math_status_map.get(f"{tid}_div_clinched"):
                    if p_wd < IS_CLINCHED:
                        updates.append({
                            "type": "good", 
                            "abbr": name,
                            "logo": logo,
                            "msg": "Clinched Division"
                        })
                elif (math_status_map.get(tid) == 'clinched_playoff' or math_status_map.get(f"{tid}_div_clinched")): # Only if mathematically clinched
                    updates.append({
                        "type": "good", 
                        "abbr": name,
                        "logo": logo,
                        "msg": "Clinched Playoff Spot"
                    })
            elif c_mp <= IS_ELIM and p_mp > IS_ELIM:
                updates.append({
                    "type": "bad", 
                    "abbr": name,
                    "logo": logo,
                    "msg": "Eliminated from Contention"
                })
            
    if not updates:
        # Fallback if no updates this week
        pass

    # Group teams for simpler ticker display
    clinched_teams = [u for u in updates if u['type'] == 'good']
    eliminated_teams = [u for u in updates if u['type'] == 'bad']
    
    # Calculate trending teams based on probability changes (using res_curr vs res_prev from above)
    trending_up = []
    trending_down = []
    
    for team in sorted_teams:
        tid = team['id']
        name = team.get('abbr', team['name'])
        logo = team.get('logo', '')
        
        # Get current and previous playoff odds
        curr = res_curr.get(tid, {})
        prev = res_prev.get(tid, {})
        
        c_mp = curr.get('madePlayoffs', 0)
        p_mp = prev.get('madePlayoffs', 0)
        change = c_mp - p_mp
        
        # Only include teams not already clinched/eliminated and with significant movement
        if c_mp > 0 and c_mp < 1000:  # still alive
            if change >= 50:  # 5%+ increase
                trending_up.append({
                    'abbr': name,
                    'logo': logo,
                    'change': f"+{((change/1000)*100):.0f}%"
                })
            elif change <= -50:  # 5%+ decrease
                trending_down.append({
                    'abbr': name,
                    'logo': logo,
                    'change': f"{((change/1000)*100):.0f}%"
                })
    
    # Sort by magnitude of change
    trending_up.sort(key=lambda x: float(x['change'].replace('%', '').replace('+', '')), reverse=True)
    trending_down.sort(key=lambda x: float(x['change'].replace('%', '')))
    
    # Limit to top 5 each
    trending_up = trending_up[:5]
    trending_down = trending_down[:5]
    
    context['key_updates'] = updates
    context['clinched_teams'] = clinched_teams
    context['eliminated_teams'] = eliminated_teams
    context['trending_up'] = trending_up
    context['trending_down'] = trending_down

    return render(request, 'simulator/index.html', context)

def classics(request):
    """
    GET /classics
    Show top classic games of the season.
    """
    global DATA_CACHE
    if not DATA_CACHE["teams"]:
        # Should be initialized, but just in case
        return redirect('/')
        
    completed = [g for g in DATA_CACHE["schedule"] if g.get('completed')]
    
    def get_lead_changes(g):
        h_lines = g.get('homeLines', [])
        a_lines = g.get('awayLines', [])
        
        # If no linescore info, return 0
        if not h_lines or not a_lines:
            return 0
            
        changes = 0
        current_leader = 0 # 0: Tie, 1: Home, -1: Away
        
        h_cum = 0
        a_cum = 0
        
        # Check after each quarter
        for i in range(min(len(h_lines), len(a_lines))):
            h_cum += h_lines[i]
            a_cum += a_lines[i]
            
            new_leader = 0
            if h_cum > a_cum: new_leader = 1
            elif a_cum > h_cum: new_leader = -1
            
            # If leader changed (and wasn't just breaking a tie, unless we count that? 
            # Strict lead change usually means Team A led, then Team B led.
            # But breaking a tie is also a momentum shift.
            # Let's count any state change from the PREVIOUS ESTABLISHED leader.
            
            if i == 0:
                current_leader = new_leader
            else:
                if new_leader != current_leader and new_leader != 0:
                    changes += 1
                    current_leader = new_leader
                elif current_leader == 0 and new_leader != 0:
                    # Gaining lead from tie (except 0-0 start)
                    # We usually don't count taking initial lead as a "change" of lead, just establishing it.
                    # But later in game breaking a tie is big.
                    # Let's count it if it's not Q1?
                    changes += 1
                    current_leader = new_leader
                    
        return changes

    def calc_score(g, lead_changes):
        home_score = g['homeScore']
        away_score = g['awayScore']
        diff = abs(home_score - away_score)
        total = home_score + away_score
        
        # Fetch Teams for Context
        ht = DATA_CACHE['teams'].get(g['homeId'], {})
        at = DATA_CACHE['teams'].get(g['awayId'], {})
        
        # 0. Context Factors
        # Quality: Sum of Win Pcts
        def get_pct(t):
            r = t.get('record', {})
            w = r.get('wins', 0)
            l = r.get('losses', 0)
            ti = r.get('ties', 0)
            if (w+l+ti) == 0: return 0.5
            return (w + 0.5*ti) / (w+l+ti)
            
        h_pct = get_pct(ht)
        a_pct = get_pct(at)
        quality_score = (h_pct + a_pct) * 200 # Max ~400 points
        
        # Rivalry: Divisional
        is_divisional = (ht.get('conference') == at.get('conference') and ht.get('division') == at.get('division'))
        rivalry_bonus = 150 if is_divisional else 0

        # 1. Closeness Base (Exponential Decay)
        # 1000 pts for tie, 500 for 1 pt diff, 250 for 2, etc.
        # Use 1/(diff+0.5) to spike it for 0/1/2/3
        # 1000 / (diff + 1) -> 1=500, 3=250, 7=125, 14=66
        base_closeness = 1200 / (diff + 1)
        
        # 2. High Score (Wildness)
        score_bonus = total * 4
        
        # 3. Overtime
        ot_bonus = 0
        if g.get('period', 0) > 4:
            ot_bonus = 800 # Massive bonus for OT
        
        # 4. Comeback
        comeback_bonus = 0
        h_lines = g.get('homeLines', [])
        a_lines = g.get('awayLines', [])
        if len(h_lines) >= 3 and len(a_lines) >= 3:
            h_q3 = sum(h_lines[:3])
            a_q3 = sum(a_lines[:3])
            if home_score > away_score and a_q3 > h_q3:
                comeback_bonus = (a_q3 - h_q3) * 50 # Increased multiplier
            elif away_score > home_score and h_q3 > a_q3:
                comeback_bonus = (h_q3 - a_q3) * 50
        
        # 5. Lead Changes (Excitement)
        lead_change_bonus = lead_changes * 75

        # 6. Wild Finish (Q4 scoring)
        wild_finish_bonus = 0
        if len(h_lines) >= 4 and len(a_lines) >= 4:
            q4_total = h_lines[3] + a_lines[3]
            if q4_total >= 21:
                wild_finish_bonus = q4_total * 15
        
        return int(base_closeness + quality_score + rivalry_bonus + score_bonus + ot_bonus + comeback_bonus + lead_change_bonus + wild_finish_bonus)

    def get_wp_history(g):
        h_lines = g.get('homeLines', [])
        a_lines = g.get('awayLines', [])
        if not h_lines or not a_lines:
            return []
            
        # Points: Start (50), Q1, Q2, Q3, Q4, OT...
        history = [50]
        h_cum = 0
        a_cum = 0
        
        # Sigmoid W/P function (roughly matched to engine's live logic)
        # prob = 1 / (1 + 10^(-diff/14))
        def calc_prob(diff):
            p = 1 / (1 + 10 ** -(diff / 14.0))
            return int(p * 100)
        
        for i in range(min(len(h_lines), len(a_lines))):
            h_cum += h_lines[i]
            a_cum += a_lines[i]
            diff = h_cum - a_cum
            history.append(calc_prob(diff))
            
        return history

    enriched = []
    for g in completed:
        lc = get_lead_changes(g)
        sc = calc_score(g, lc)
        wp_hist = get_wp_history(g)
        
        # Generate SVG Points String
        # Width: 100, Height: 30
        wp_svg_points = ""
        if wp_hist and len(wp_hist) > 1:
            points = []
            step = 100.0 / (len(wp_hist) - 1)
            for i, p in enumerate(wp_hist):
                x = i * step
                # Map 0-100 prob to 30-0, so 100% is top (0), 0% is bottom (30)
                # But actually 50% is 15.
                # y = 30 - (p/100 * 30) = 30 * (1 - p/100)
                y = 30 * (1 - (p / 100.0))
                points.append(f"{x:.1f},{y:.1f}")
            wp_svg_points = " ".join(points)
        
        ht = DATA_CACHE['teams'].get(g['homeId'], {})
        at = DATA_CACHE['teams'].get(g['awayId'], {})
        
        enriched.append({
            'week': g['week'],
            'home': ht.get('name'),
            'away': at.get('name'),
            'home_logo': ht.get('logo'),
            'away_logo': at.get('logo'),
            'score_str': f"{g['awayScore']} - {g['homeScore']}",
            'classic_score': sc,
            'lead_changes': lc, 
            'wp_history': wp_hist,
            'wp_svg_points': wp_svg_points, # Ready for template
            'diff': abs(g['homeScore'] - g['awayScore']),
            'total_score': g['homeScore'] + g['awayScore'],
            'is_ot': (g.get('period', 0) > 4)
        })
        
    # Sort Handling
    sort_key = request.GET.get('sort', 'classic_score')
    
    if sort_key == 'lead_changes':
        enriched.sort(key=lambda x: (x['lead_changes'], x['classic_score']), reverse=True)
    elif sort_key == 'score':
        enriched.sort(key=lambda x: x['total_score'], reverse=True)
    elif sort_key == 'diff':
        enriched.sort(key=lambda x: x['diff']) # Ascending for closeness
    elif sort_key == 'week':
        enriched.sort(key=lambda x: x['week'], reverse=True)
    else: # Default classic
        enriched.sort(key=lambda x: x['classic_score'], reverse=True)
    
    context = {
        'games': enriched[:100], # Increased limit slightly
        'current_sort': sort_key
    }
    
    return render(request, 'simulator/classics.html', context)
