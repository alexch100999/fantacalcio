#!/usr/bin/env python3
"""
Scarica il calendario completo di Serie A (tutte le giornate) da API-Football
e calcola una difficoltà stimata per ogni partita, usata poi dal sito per
suggerire le migliori coppie di portieri in base al calendario.

Come si stima la difficoltà (approssimazione dichiarata, non un modello xG):
    difficolta(squadra, giornata) = FVM medio della rosa avversaria
                                     × 0.92 se si gioca in casa
                                     × 1.08 se si gioca in trasferta
Un FVM medio più alto della squadra avversaria indica (in modo grezzo) una
squadra più forte, quindi una partita più complicata. Il fattore casa/trasferta
è un aggiustamento semplice, non calibrato su dati storici precisi.

USO:
    export API_FOOTBALL_KEY="la-tua-chiave"
    python3 scripts/update_calendar.py

Variabili opzionali:
    SEASON   anno stagione, es. 2026 (default: 2026)
"""

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

API_BASE = "https://v3.football.api-sports.io"
SEASON = int(os.environ.get("SEASON", "2026"))
LEAGUE_ID = 135  # Serie A
REQUEST_DELAY_SECONDS = 1.0

ROOT = Path(__file__).resolve().parent.parent
QUOTAZIONI_PATH = ROOT / "data" / "fvm_quotazioni.json"
OUTPUT_PATH = ROOT / "data" / "calendario.json"


def get_session() -> requests.Session:
    key = os.environ.get("API_FOOTBALL_KEY")
    if not key:
        print("ERRORE: variabile d'ambiente API_FOOTBALL_KEY non impostata.", file=sys.stderr)
        sys.exit(1)
    s = requests.Session()
    s.headers.update({"x-apisports-key": key})
    return s


def fetch_fixtures(session: requests.Session) -> list:
    resp = session.get(
        f"{API_BASE}/fixtures",
        params={"league": LEAGUE_ID, "season": SEASON},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("errors"):
        print(f"API ha restituito errori: {data['errors']}", file=sys.stderr)
    return data.get("response", [])


def team_strength_from_quotazioni() -> dict:
    """FVM medio per squadra, calcolato dal listone statico (nessuna chiamata API)."""
    with open(QUOTAZIONI_PATH, encoding="utf-8") as f:
        players = json.load(f)

    totals, counts = {}, {}
    for p in players:
        sq = p["squadra"]
        totals[sq] = totals.get(sq, 0) + p["fvm"]
        counts[sq] = counts.get(sq, 0) + 1

    return {sq: round(totals[sq] / counts[sq], 1) for sq in totals}


def build_calendar(fixtures: list, strength: dict) -> dict:
    squadre = {}

    for fx in fixtures:
        league = fx.get("league", {}) or {}
        giornata_raw = league.get("round", "")  # es. "Regular Season - 3"
        try:
            giornata = int(giornata_raw.split("-")[-1].strip())
        except (ValueError, AttributeError):
            giornata = None

        home = fx["teams"]["home"]["name"]
        away = fx["teams"]["away"]["name"]
        date = fx["fixture"]["date"]

        home_strength = strength.get(away, sum(strength.values()) / len(strength))
        away_strength = strength.get(home, sum(strength.values()) / len(strength))

        squadre.setdefault(home, []).append({
            "giornata": giornata,
            "data": date,
            "avversario": away,
            "casa": True,
            "difficolta": round(home_strength * 0.92, 1),
        })
        squadre.setdefault(away, []).append({
            "giornata": giornata,
            "data": date,
            "avversario": home,
            "casa": False,
            "difficolta": round(away_strength * 1.08, 1),
        })

    for sq in squadre:
        squadre[sq].sort(key=lambda r: (r["giornata"] is None, r["giornata"]))

    return squadre


def main():
    session = get_session()
    print(f"Scarico calendario Serie A stagione {SEASON}...")
    fixtures = fetch_fixtures(session)
    print(f"Partite trovate: {len(fixtures)}")

    strength = team_strength_from_quotazioni()
    print(f"Forza squadre calcolata da FVM medio (fonte: fvm_quotazioni.json, {len(strength)} squadre)")

    calendario = build_calendar(fixtures, strength)

    output = {
        "generatoIl": datetime.utcnow().isoformat() + "Z",
        "stagione": SEASON,
        "note": "Difficoltà stimata dal FVM medio della rosa avversaria, con lieve correzione casa/trasferta. È un'approssimazione, non un modello statistico calibrato.",
        "forzaSquadre": strength,
        "squadre": calendario,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=1)

    print(f"Scritto {OUTPUT_PATH} ({len(calendario)} squadre)")


if __name__ == "__main__":
    main()
