#!/usr/bin/env python3
"""
Raccoglie gol e assist delle amichevoli estive delle squadre di Serie A da
API-Football (stessa API legittima usata da update_stats.py, non uno scraper).

Perché uno script separato: le amichevoli non contano nel regolamento
ufficiale del fantacalcio, quindi questi dati NON entrano nel calcolo della
fantamedia stimata — sono solo un'informazione aggiuntiva ("chi sta bene in
questo precampionato") che il sito mostra a parte.

Gestione del limite di chiamate (100/giorno sul piano gratuito):
Lo script salva in data/_friendlies_cache.json l'elenco delle partite già
analizzate. Ogni esecuzione analizza solo le partite nuove, fino a un tetto
di MAX_CALLS chiamate per run (di default 80, per lasciare margine ad altri
usi della chiave nello stesso giorno). Se restano partite da analizzare lo
script te lo dice chiaramente: rilancialo il giorno dopo per continuare.

USO:
    export API_FOOTBALL_KEY="la-tua-chiave"
    python3 scripts/update_friendlies.py

Variabili opzionali:
    SEASON      anno stagione, es. 2026 (default: 2026)
    FROM_DATE   inizio finestra amichevoli, formato YYYY-MM-DD (default: 2026-07-01)
    TO_DATE     fine finestra amichevoli, formato YYYY-MM-DD (default: oggi)
    MAX_CALLS   tetto di chiamate API per questa esecuzione (default: 80)
"""

import json
import os
import sys
import time
from datetime import date, datetime
from pathlib import Path

import requests

API_BASE = "https://v3.football.api-sports.io"
SEASON = int(os.environ.get("SEASON", "2026"))
FROM_DATE = os.environ.get("FROM_DATE", "2026-07-01")
TO_DATE = os.environ.get("TO_DATE", date.today().isoformat())
MAX_CALLS = int(os.environ.get("MAX_CALLS", "80"))
REQUEST_DELAY_SECONDS = 1.0

ROOT = Path(__file__).resolve().parent.parent
CACHE_PATH = ROOT / "data" / "_friendlies_cache.json"
OUTPUT_PATH = ROOT / "data" / "amichevoli.json"

calls_made = 0


def get_session() -> requests.Session:
    key = os.environ.get("API_FOOTBALL_KEY")
    if not key:
        print("ERRORE: variabile d'ambiente API_FOOTBALL_KEY non impostata.", file=sys.stderr)
        sys.exit(1)
    s = requests.Session()
    s.headers.update({"x-apisports-key": key})
    return s


def api_get(session: requests.Session, path: str, params: dict) -> dict:
    global calls_made
    if calls_made >= MAX_CALLS:
        raise RuntimeError("MAX_CALLS raggiunto")
    resp = session.get(f"{API_BASE}/{path}", params=params, timeout=30)
    resp.raise_for_status()
    calls_made += 1
    time.sleep(REQUEST_DELAY_SECONDS)
    return resp.json()


def load_cache() -> dict:
    if CACHE_PATH.exists():
        with open(CACHE_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {"fixtures_processed": {}, "team_ids": {}}


def save_cache(cache: dict):
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=1)


def get_serie_a_teams(session: requests.Session, cache: dict) -> dict:
    """Ritorna {team_id: team_name} per le 20 squadre di Serie A. Cachato:
    i team non cambiano durante la stagione, quindi si scarica una sola volta."""
    if cache["team_ids"]:
        return {int(k): v for k, v in cache["team_ids"].items()}

    data = api_get(session, "teams", {"league": 135, "season": SEASON})
    teams = {}
    for entry in data.get("response", []):
        team = entry.get("team", {})
        teams[team["id"]] = team["name"]

    cache["team_ids"] = {str(k): v for k, v in teams.items()}
    save_cache(cache)
    print(f"Squadre Serie A trovate: {len(teams)}")
    return teams


def get_team_friendlies(session: requests.Session, team_id: int) -> list:
    """Fixture di tipo amichevole per una squadra nella finestra di date data."""
    data = api_get(session, "fixtures", {
        "team": team_id,
        "from": FROM_DATE,
        "to": TO_DATE,
        "season": SEASON,
    })
    fixtures = data.get("response", [])
    # Filtra lato client per tenere solo le amichevoli (il nome esatto della
    # competizione può variare leggermente, es. "Friendlies Clubs" / "Friendlies")
    return [
        fx for fx in fixtures
        if "friendl" in (fx.get("league", {}).get("name", "").lower())
        and fx.get("fixture", {}).get("status", {}).get("short") == "FT"
    ]


def get_fixture_scorers(session: requests.Session, fixture_id: int) -> list:
    """Eventi gol di una partita: più economico di /fixtures/players per
    questo scopo (una sola chiamata, ci servono solo i marcatori/assist)."""
    data = api_get(session, "fixtures/events", {"fixture": fixture_id})
    events = data.get("response", [])
    scorers = []
    for ev in events:
        if ev.get("type") != "Goal":
            continue
        player = ev.get("player", {}) or {}
        assist = ev.get("assist", {}) or {}
        team = ev.get("team", {}) or {}
        if player.get("name"):
            scorers.append({
                "nome": player["name"],
                "squadra": team.get("name"),
                "tipo": "gol",
            })
        if assist.get("name"):
            scorers.append({
                "nome": assist["name"],
                "squadra": team.get("name"),
                "tipo": "assist",
            })
    return scorers


def main():
    session = get_session()
    cache = load_cache()

    teams = get_serie_a_teams(session, cache)

    all_fixture_ids = {}  # fixture_id -> {"date":..., "teams": "A vs B"}
    for team_id, team_name in teams.items():
        try:
            fixtures = get_team_friendlies(session, team_id)
        except RuntimeError:
            print("Limite chiamate raggiunto durante la raccolta fixture. Rilancia domani.")
            break
        for fx in fixtures:
            fid = fx["fixture"]["id"]
            all_fixture_ids[fid] = {
                "date": fx["fixture"]["date"],
                "home": fx["teams"]["home"]["name"],
                "away": fx["teams"]["away"]["name"],
            }

    print(f"Amichevoli concluse trovate (tutte le squadre): {len(all_fixture_ids)}")

    processed = cache["fixtures_processed"]
    new_ids = [fid for fid in all_fixture_ids if str(fid) not in processed]
    print(f"Già in cache: {len(all_fixture_ids) - len(new_ids)}  |  Da analizzare ora: {len(new_ids)}")

    for fid in new_ids:
        try:
            scorers = get_fixture_scorers(session, fid)
        except RuntimeError:
            print(f"Limite chiamate raggiunto. Analizzate {len(processed)} amichevoli finora su "
                  f"{len(all_fixture_ids)} totali trovate. Rilancia lo script domani per continuare.")
            break
        processed[str(fid)] = {
            **all_fixture_ids[fid],
            "scorers": scorers,
        }
        save_cache(cache)  # salva incrementalmente: se si interrompe, non si perde lavoro

    # Aggrega per giocatore da tutta la cache (non solo le nuove partite)
    aggregate = {}
    for fixture_data in processed.values():
        for s in fixture_data.get("scorers", []):
            key = (s["nome"], s["squadra"])
            if key not in aggregate:
                aggregate[key] = {"nome": s["nome"], "squadra": s["squadra"], "golAmichevoli": 0, "assistAmichevoli": 0}
            if s["tipo"] == "gol":
                aggregate[key]["golAmichevoli"] += 1
            else:
                aggregate[key]["assistAmichevoli"] += 1

    output = sorted(aggregate.values(), key=lambda r: (-r["golAmichevoli"], -r["assistAmichevoli"]))
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "generatoIl": datetime.utcnow().isoformat() + "Z",
            "amichevoliAnalizzate": len(processed),
            "amichevoliTotaliTrovate": len(all_fixture_ids),
            "giocatori": output,
        }, f, ensure_ascii=False, indent=1)

    print(f"Scritto {OUTPUT_PATH}: {len(output)} giocatori con almeno un gol/assist in amichevole.")
    print(f"Chiamate API usate in questa esecuzione: {calls_made}/{MAX_CALLS}")
    if len(processed) < len(all_fixture_ids):
        print("Copertura parziale: rilancia lo script (anche domani) per analizzare le amichevoli rimanenti.")


if __name__ == "__main__":
    main()
