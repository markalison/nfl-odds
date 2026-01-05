# simulator/structure.py

TEAM_STRUCTURE = {
    "BUF": { "conf": "AFC", "div": "AFC East" },
    "MIA": { "conf": "AFC", "div": "AFC East" },
    "NE": { "conf": "AFC", "div": "AFC East" },
    "NYJ": { "conf": "AFC", "div": "AFC East" },
    "BAL": { "conf": "AFC", "div": "AFC North" },
    "CIN": { "conf": "AFC", "div": "AFC North" },
    "CLE": { "conf": "AFC", "div": "AFC North" },
    "PIT": { "conf": "AFC", "div": "AFC North" },
    "HOU": { "conf": "AFC", "div": "AFC South" },
    "IND": { "conf": "AFC", "div": "AFC South" },
    "JAX": { "conf": "AFC", "div": "AFC South" },
    "TEN": { "conf": "AFC", "div": "AFC South" },
    "DEN": { "conf": "AFC", "div": "AFC West" },
    "KC": { "conf": "AFC", "div": "AFC West" },
    "LV": { "conf": "AFC", "div": "AFC West" },
    "LAC": { "conf": "AFC", "div": "AFC West" },
    "DAL": { "conf": "NFC", "div": "NFC East" },
    "NYG": { "conf": "NFC", "div": "NFC East" },
    "PHI": { "conf": "NFC", "div": "NFC East" },
    "WSH": { "conf": "NFC", "div": "NFC East" },
    "CHI": { "conf": "NFC", "div": "NFC North" },
    "DET": { "conf": "NFC", "div": "NFC North" },
    "GB": { "conf": "NFC", "div": "NFC North" },
    "MIN": { "conf": "NFC", "div": "NFC North" },
    "ATL": { "conf": "NFC", "div": "NFC South" },
    "CAR": { "conf": "NFC", "div": "NFC South" },
    "NO": { "conf": "NFC", "div": "NFC South" },
    "TB": { "conf": "NFC", "div": "NFC South" },
    "ARI": { "conf": "NFC", "div": "NFC West" },
    "LAR": { "conf": "NFC", "div": "NFC West" },
    "SF": { "conf": "NFC", "div": "NFC West" },
    "SEA": { "conf": "NFC", "div": "NFC West" },
    # Aliases
    "WAS": { "conf": "NFC", "div": "NFC East" },
    "JAC": { "conf": "AFC", "div": "AFC South" }
}

def get_team_structure(abbr):
    if not abbr:
        return { "conf": "NFL", "div": "" }
    
    # Try strict match first, then uppercase
    struct = TEAM_STRUCTURE.get(abbr)
    if not struct:
        struct = TEAM_STRUCTURE.get(abbr.upper())
    
    return struct or { "conf": "NFL", "div": "" }

TEAM_COLORS = {
    "ARI": "#97233F", "ATL": "#A71930", "BAL": "#241773", "BUF": "#00338D",
    "CAR": "#0085CA", "CHI": "#0B162A", "CIN": "#FB4F14", "CLE": "#311D00",
    "DAL": "#003594", "DEN": "#FB4F14", "DET": "#0076B6", "GB": "#203731",
    "HOU": "#03202F", "IND": "#002C5F", "JAX": "#006778", "KC": "#E31837",
    "LAC": "#0080C6", "LAR": "#003594", "LV": "#000000", "MIA": "#008E97",
    "MIN": "#4F2683", "NE": "#002244", "NO": "#D3BC8D", "NYG": "#0B2265",
    "NYJ": "#125740", "PHI": "#004C54", "PIT": "#FFB612", "SEA": "#002244",
    "SF": "#AA0000", "TB": "#D50A0A", "TEN": "#0C2340", "WSH": "#5A1414",
    "WAS": "#5A1414", "JAC": "#006778"
}

TEAM_ALT_COLORS = {
    # Generally White or Secondary
    "ARI": "#000000", "ATL": "#000000", "BAL": "#000000", "BUF": "#C60C30",
    "CAR": "#101820", "CHI": "#C83803", "CIN": "#000000", "CLE": "#FF3C00",
    "DAL": "#869397", "DEN": "#002244", "DET": "#B0B7BC", "GB": "#FFB612",
    "HOU": "#A71930", "IND": "#FFFFFF", "JAX": "#D7A22A", "KC": "#FFB81C",
    "LAC": "#FFC20E", "LAR": "#FFD100", "LV": "#A5ACAF", "MIA": "#F58220",
    "MIN": "#FFC62F", "NE": "#C60C30", "NO": "#101820", "NYG": "#A71930",
    "NYJ": "#000000", "PHI": "#A5ACAF", "PIT": "#101820", "SEA": "#69BE28",
    "SF": "#B3995D", "TB": "#34302B", "TEN": "#4B92DB", "WSH": "#FFB612",
    # Aliases
    "WAS": "#FFB612", "JAC": "#D7A22A"
}
