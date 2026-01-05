from datetime import datetime

class MathEngine:
    """
    Deterministic logic to validate Clinch/Elimination status based on 
    Mathematical Constraints (Max Possible Wins vs Competitor Minimums).
    
    Methodology:
    1. Define Bounds: Calculate Min/Max wins for every team.
    2. Constraint Check:
       - Elimination: Team_Max < Competitor_Min_Threshold (Cannot catch up)
       - Clinch: Team_Min > Competitor_Max_Threshold (Cannot be caught)
    3. Tiebreakers: Currently conservative (Alive if Max == Min).
       Future: Enumerate scenarios for tiebreaker resolution.
    
    Acts as the Source of Truth for 'x' (Clinched) and 'e' (Eliminated).
    """

    def __init__(self, teams, schedule):
        self.teams = teams
        self.schedule = schedule

    def get_team_bounds(self):
        """
        Calculate Min/Max wins for every team.
        Returns: { tid: {'min': int, 'max': int, 'conf': str, 'div': str} }
        """
        bounds = {}
        
        # Initialize
        for tid, t in self.teams.items():
            wins = t['record']['wins'] # Ties? Treating as 0.5? 
            # For strict mathematical exclusion, typically we count 0.5 for ties in sorting, 
            # but for "Max Wins" (raw count), usually we track Wins.
            # Let's use points: Win=1, Tie=0.5.
            
            curr_pts = wins + (t['record']['ties'] * 0.5)
            
            bounds[tid] = {
                'curr': curr_pts,
                'min': curr_pts, # Assume lose out
                'max': curr_pts, # Will add remaining
                'conf': t['conference'],
                'div': t['division'],
                'abbr': t.get('abbr', '')
            }

        # Process Schedule for Remaining Games
        for g in self.schedule:
            if g.get('completed'): continue
            
            # Identify participants
            hid = g['homeId']
            aid = g['awayId']
            
            if hid in bounds:
                bounds[hid]['max'] += 1
            if aid in bounds:
                bounds[aid]['max'] += 1
                
        return bounds

    def check_status(self, bounds):
        """
        Determine strict status for each team based on bounds.
        Status: 'clinched_playoff', 'eliminated_playoff', 'alive'
        """
        status_map = {}
        
        # Structure by Conference
        # { 'AFC': [ {id, min, max}, ... ], 'NFC': ... }
        confs = {'AFC': [], 'NFC': []}
        
        for tid, data in bounds.items():
            c = data['conf']
            if c in confs:
                entry = data.copy()
                entry['id'] = tid
                confs[c].append(entry)

        # Evaluate each Conference
        for c_name, teams in confs.items():
            # 1. Division Math (Who can win the division?)
            # Group by Div
            divs = {}
            for t in teams:
                d = t['div']
                if d not in divs: divs[d] = []
                divs[d].append(t)
                
            for d_name, d_teams in divs.items():
                # Sort by Current (Floor)
                d_curr_sort = sorted(d_teams, key=lambda x: x['curr'], reverse=True)
                leader_curr = d_curr_sort[0]['curr']
                
                # Sort by Max (Ceiling)
                d_max_sort = sorted(d_teams, key=lambda x: x['max'], reverse=True)
                runner_up_max = d_max_sort[1]['max'] if len(d_teams) > 1 else 0
                
                for t in d_teams:
                    # Div Elimination: My Max < Leader Current?
                    # (Strictly: My Max < Leader's Current Floor)
                    if t['max'] < leader_curr:
                        t['status_div'] = 'eliminated'
                    # Div Clinch: My Min > RunnerUp Max?
                    elif t['min'] > runner_up_max:
                        t['status_div'] = 'clinched'
                        
            # 2. Wildcard/Playoff Math
            
            # Sort by Current Wins (Desc) - The "Floor" of the race
            teams_by_curr = sorted(teams, key=lambda x: x['curr'], reverse=True)
            
            # 7th seed is index 6. 
            # If I can't reach the 7th seed's current wins, I am OUT.
            if len(teams_by_curr) >= 7:
                threshold_elim = teams_by_curr[6]['curr'] 
            else:
                threshold_elim = 0
                
            # Sort by Max Potential (Desc) - The "Ceiling" of the chase
            # To clinch, I must be unreachable by the 8th best team's MAX.
            teams_by_max = sorted(teams, key=lambda x: x['max'], reverse=True)
            
            if len(teams_by_max) >= 8:
                threshold_clinch = teams_by_max[7]['max']
            else:
                threshold_clinch = 99
                
            for t in teams:
                tid = t['id']
                s = 'alive'
                
                # Check Elimination
                # Condition 1: Can't Catch 7th Seed Floor
                if t['max'] < threshold_elim:
                    s = 'eliminated_playoff'
                
                # Condition 2: Division Elimination Check (Refinement)
                # If eliminated from Div AND eliminated from Wildcard...
                # Actually, threshold_elim covers Wildcard.
                # If t['max'] < threshold_elim, they are below 7th seed's floor.
                # 7th seed floor >= Div Winner Floor? Not necessarily, but usually.
                
                # Check Clinch (Override)
                # Condition: My Floor > 8th Place Ceiling
                elif t['min'] > threshold_clinch:
                    s = 'clinched_playoff'
                    
                # Division Logic Integration (If won div, clinched playoff)
                if t.get('status_div') == 'clinched':
                    s = 'clinched_playoff'
                    
                status_map[tid] = s
                
                # Expose specific division clinch status for UI flags
                if t.get('status_div') == 'clinched':
                    status_map[f"{tid}_div_clinched"] = True
            
            # Store thresholds for debugging
            status_map[f'threshold_elim_{c_name.lower()}'] = threshold_elim
            status_map[f'threshold_clinch_{c_name.lower()}'] = threshold_clinch
                
        return status_map

    def get_playoff_scenarios(self, tid, bounds):
        """
        Identify VIABLE playoff paths and show ONLY requirements for those paths.
        
        Paths checked:
        1. Division title
        2. Wildcard spot
        
        Shows requirements ONLY for mathematically possible paths.
        """
        try:
            if tid not in bounds:
                return {'status': 'unknown', 'message': 'Team not found', 'details': []}
            
            team = bounds[tid]
            team_abbr = team.get('abbr', 'Team')
            conf = team['conf']
            div = team['div']
            max_wins = team['max']
            min_wins = team['min']
            current_wins = team['curr']
            remaining = int(max_wins - current_wins)
            
            # Get conference and division teams
            conf_teams = {t_id: t for t_id, t in bounds.items() if t['conf'] == conf and t_id != tid}
            div_teams = {t_id: t for t_id, t in conf_teams.items() if t['div'] == div}
            
            details = []
            
            # ========== CHECK PATH 1: DIVISION TITLE ==========
            # ========== CHECK PATH 1: DIVISION TITLE ==========
            div_path_viable = False
            div_leader = None
            div_requirements = []
            
            if div_teams:
                # Find current division leader (among other teams)
                div_leader_id = max(div_teams.keys(), key=lambda x: div_teams[x]['curr'])
                div_leader = div_teams[div_leader_id]
                leader_abbr = div_leader.get('abbr', 'Leader')
                leader_curr = div_leader['curr']
                leader_remaining = int(div_leader['max'] - leader_curr)
                
                # Are WE the division leader?
                if current_wins > leader_curr:
                    # We're already leading the division
                    div_path_viable = True
                    if remaining > 0:
                        div_requirements.append({'type': 'action', 'text': f"Win any of {remaining} remaining games to secure division"})
                    else:
                        div_requirements.append({'type': 'success', 'text': "Division title secured"})
                # Can we catch the division leader?
                elif max_wins > leader_curr:
                    # We can finish with more wins than they currently have
                    div_path_viable = True
                    
                    # What do we need?
                    their_losses_needed = int(max_wins - leader_curr)
                    
                    div_requirements.append({'type': 'team_action', 'team_id': tid, 'abbr': team_abbr, 'text': f"must WIN all {remaining} remaining game(s)"})
                    
                    if their_losses_needed > 0:
                        if their_losses_needed >= leader_remaining:
                            div_requirements.append({'type': 'team_action', 'team_id': div_leader_id, 'abbr': leader_abbr, 'text': f"must LOSE all {leader_remaining} remaining game(s)"})
                        else:
                            div_requirements.append({'type': 'team_action', 'team_id': div_leader_id, 'abbr': leader_abbr, 'text': f"must lose at least {their_losses_needed} of {leader_remaining} remaining game(s)"})
            else:
                # No other teams in division - we win by default
                div_path_viable = True
                div_requirements.append({'type': 'success', 'text': "Only team in division"})
            
            # ========== CHECK PATH 2: WILDCARD ==========
            wildcard_path_viable = False
            wildcard_requirements = []
            
            # Sort conference by current wins (excludes us)
            conf_by_wins = sorted(conf_teams.items(), key=lambda x: x[1]['curr'], reverse=True)
            
            # Count how many teams are guaranteed ahead
            guaranteed_ahead_count = sum(1 for _, t in conf_teams.items() 
                                         if t['min'] > max_wins or t['curr'] > max_wins)
            
            if guaranteed_ahead_count < 7:
                # Not mathematically eliminated from wildcard
                # Find 7th place team (or would-be 7th)
                if len(conf_by_wins) >= 7:
                    seventh_id, seventh = conf_by_wins[6]
                    seventh_abbr = seventh.get('abbr', '7th')
                    seventh_curr = seventh['curr']
                    seventh_remaining = int(seventh['max'] - seventh_curr)
                    
                    # Can we reach 7th place?
                    if max_wins > seventh_curr:
                        wildcard_path_viable = True
                        
                        their_losses_needed = int(max_wins - seventh_curr)
                        
                        wildcard_requirements.append({'type': 'team_action', 'team_id': tid, 'abbr': team_abbr, 'text': f"must WIN all {remaining} remaining game(s)"})
                        
                        if their_losses_needed > 0:
                            if their_losses_needed >= seventh_remaining:
                                wildcard_requirements.append({'type': 'team_action', 'team_id': seventh_id, 'abbr': seventh_abbr, 'text': f"must LOSE all {seventh_remaining} remaining game(s)"})
                            else:
                                wildcard_requirements.append({'type': 'team_action', 'team_id': seventh_id, 'abbr': seventh_abbr, 'text': f"must lose at least {their_losses_needed} of {seventh_remaining} remaining game(s)"})
                else:
                    # Fewer than 7 teams in conference
                    wildcard_path_viable = True
                    wildcard_requirements.append({'type': 'success', 'text': "Wildcard spot available"})
            
            # ========== DETERMINE STATUS AND BUILD DETAILS ==========
            
            # ELIMINATED (neither path viable)
            if not div_path_viable and not wildcard_path_viable:
                status = 'eliminated'
                message = "Mathematically eliminated from playoffs."
                details.append({'type': 'error', 'text': "No viable path to playoffs"})
                if div_leader:
                    details.append({'type': 'info', 'text': f"Division: {div_leader.get('abbr', 'Leader')} has {int(div_leader['curr'])}W (unreachable)"})
                details.append({'type': 'info', 'text': f"Wildcard: {guaranteed_ahead_count} teams guaranteed ahead"})
            
            # CLINCHED
            elif len([t for t in conf_teams.values() if t['max'] < min_wins]) >= (len(conf_teams) + 1 - 7):
                status = 'clinched'
                message = "Clinched playoff berth!"
                details.append({'type': 'success', 'text': "Playoff spot secured"})
            
            # ALIVE - Show viable paths
            else:
                status = 'alive'
                
                # Determine which paths to show
                if div_path_viable and not wildcard_path_viable:
                    # ONLY DIVISION PATH
                    message = "Division title is the only path to playoffs."
                    details.append({'type': 'header', 'text': "Division Path (ONLY PATH)"})
                    details.extend(div_requirements)
                    
                elif wildcard_path_viable and not div_path_viable:
                    # ONLY WILDCARD PATH
                    message = "Wildcard is the only path to playoffs."
                    details.append({'type': 'header', 'text': "Wildcard Path (ONLY PATH)"})
                    details.extend(wildcard_requirements)
                    
                elif div_path_viable and wildcard_path_viable:
                    # BOTH PATHS VIABLE
                    message = "Two paths to playoffs available."
                    
                    # Check if requirements are the same
                    # (Simple equality check won't work perfectly on list of dicts if we cared deeply, 
                    # but here the generated strings inside would be identical)
                    if [d['text'] for d in div_requirements] == [d['text'] for d in wildcard_requirements]:
                        details.append({'type': 'header', 'text': "Requirements (both paths)"})
                        details.extend(div_requirements)
                    else:
                        details.append({'type': 'header', 'text': "Division Path"})
                        details.extend(div_requirements)
                        details.append({'type': 'spacer'})
                        details.append({'type': 'header', 'text': "Wildcard Path"})
                        details.extend(wildcard_requirements)
                else:
                    # Fallback
                    message = "Playoff hopes alive."
                    details.append({'type': 'info', 'text': f"{remaining} game(s) remaining"})
            
            return {
                'status': status,
                'message': message,
                'details': details,
                'max_wins': max_wins,
                'min_wins': min_wins,
                'current_wins': current_wins,
                'remaining_games': remaining,
                'guaranteed_ahead': guaranteed_ahead_count if 'guaranteed_ahead_count' in locals() else 0,
                'behind_us': len([t for t in conf_teams.values() if t['max'] < min_wins]),
                'in_contention': len([t for t in conf_teams.values() 
                                     if not (t['min'] > max_wins or t['curr'] > max_wins or t['max'] < min_wins)])
            }
        except Exception as e:
            # Return error info for debugging
            import traceback
            print(f"ERROR in get_playoff_scenarios for team {tid}: {str(e)}")
            print(traceback.format_exc())
            return {
                'status': 'error',
                'message': f'Error calculating scenarios: {str(e)}',
                'details': [f'Please check server logs'],
                'max_wins': 0,
                'min_wins': 0,
                'current_wins': 0,
                'remaining_games': 0,
                'guaranteed_ahead': 0,
                'behind_us': 0,
                'in_contention': 0
            }
