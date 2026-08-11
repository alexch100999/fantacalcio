#!/usr/bin/env python3
"""
Aggiorna data/players.json usando le statistiche reali di API-Football
(https://www.api-football.com), un'API pensata per sviluppatori — non uno
scraper. Serve una API key gratuita (vedi README, sezione "Aggiornamento
automatico via API-Football").

Cosa fa:
1. Scarica le statistiche stagionali di tutti i giocatori di Serie A
   dall'endpoint /players (paginato).
2. Calcola una "fantamedia stimata" applicando il regolamento classico
   (gol +3, assist +1, rigore parato +3, rigore sbagliato -3, gol subito -1
   per portieri/difensori, ammonizione -0.5, espulsione -1) sui dati grezzi
   dell'API — NON è la fantamedia ufficiale di fantacalcio.it, è una stima
   calcolata da noi con la stessa formula.
3. Abbina ogni giocatore trovato al listone statico (data/fvm_quotazioni.json,
   che contiene FVM e quotazione base e non cambia mai in automatico) tramite
   corrispondenza sul nome.
4. Scrive il risultato in data/players.json, lo stesso file letto dal sito.

USO:
    export API_FOOTBALL_KEY="la-tua-chiave"
    python3 scripts/update_stats.py

Variabili opzionali:
    SEASON        anno di inizio stagione, es. 2026 per 2026/27 (default: 2026)
    LEAGUE_ID     id competizione in API-Football, 135 = Serie A (default: 135)
"""

import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path

import requests

API_BASE = "https://v3.football.api-sports.io"
LEAGUE_ID = int(os.environ.get("LEAGUE_ID", "135"))   # Serie A
SEASON = int(os.environ.get("SEASON", "2026"))          # stagione 2026/27
REQUEST_DELAY_SECONDS = 1.0  # margine di cortesia, il free tier è comunque limitato a 100/giorno

ROOT = Path(__file__).resolve().parent.parent
QUOTAZIONI_PATH = ROOT / "data" / "fvm_quotazioni.json"
OUTPUT_PATH = ROOT / "data" / "players.json"

POSITION_MAP = {
    "Goalkeeper": "P",
    "Defender": "D",
    "Midfielder": "C",
    "Attacker": "A",
}


def normalize_name(name: str) -> str:
    """Normalizza un nome per il confronto: minuscolo, senza accenti/punteggiatura."""
    if not name:
        return ""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_name = "".join(c for c in nfkd if not unicodedata.combining(c))
    ascii_name = re.sub(r"[^a-z0-9 ]", "", ascii_name.lower())
    return re.sub(r"\s+", " ", ascii_name).strip()


def get_session() -> requests.Session:
    key = os.environ.get("API_FOOTBALL_KEY")
    if not key:
        print("ERRORE: variabile d'ambiente API_FOOTBALL_KEY non impostata.", file=sys.stderr)
        sys.exit(1)
    s = requests.Session()
    s.headers.update({"x-apisports-key": key})
    return s


def fetch_all_players(session: requests.Session) -> list:
    """Scarica tutte le pagine di /players per la lega e stagione indicate."""
    players = []
    page = 1
    while True:
        resp = session.get(
            f"{API_BASE}/players",
            params={"league": LEAGUE_ID, "season": SEASON, "page": page},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        if data.get("errors"):
            print(f"API ha restituito errori: {data['errors']}", file=sys.stderr)

        results = data.get("response", [])
        players.extend(results)

        paging = data.get("paging", {})
        current, total = paging.get("current", page), paging.get("total", page)
        print(f"  pagina {current}/{total} — {len(results)} giocatori")

        if current >= total or not results:
            break
        page += 1
        time.sleep(REQUEST_DELAY_SECONDS)

    return players


def compute_fm_stimata(stat: dict, ruolo: str) -> float | None:
    """
    Applica il regolamento classico ai numeri grezzi di una singola voce
    'statistics' di API-Football per stimare una fantamedia a partita.
    Ritorna None se il giocatore non ha minutaggio registrato.
    """
    games = stat.get("games", {}) or {}
    appearences = games.get("appearences") or 0
    if not appearences:
        return None

    goals = stat.get("goals", {}) or {}
    cards = stat.get("cards", {}) or {}
    penalty = stat.get("penalty", {}) or {}

    gol = goals.get("total") or 0
    assist = goals.get("assists") or 0
    subiti = goals.get("conceded") or 0
    rig_parati = penalty.get("saved") or 0
    rig_sbagliati = penalty.get("missed") or 0
    gialli = cards.get("yellow") or 0
    rossi = cards.get("red") or 0

    base_voto = 6.0  # voto base "politico" usato come riferimento in assenza del voto reale
    punteggio = (
        base_voto
        + gol * 3
        + assist * 1
        - gialli * 0.5
        - rossi * 1
        + rig_parati * 3
        - rig_sbagliati * 3
    )
    if ruolo in ("P", "D"):
        # gol subiti pesano solo su portieri/difensori nel modificatore classico
        punteggio -= subiti * 1

    return round(punteggio / appearences, 2)


def extract_player_row(entry: dict) -> dict | None:
    player = entry.get("player", {}) or {}
    stats_list = entry.get("statistics", []) or []
    if not stats_list:
        return None
    stat = stats_list[0]  # statistiche aggregate per la lega/stagione richiesta

    games = stat.get("games", {}) or {}
    ruolo = POSITION_MAP.get(games.get("position"), None)
    if ruolo is None:
        return None

    goals = stat.get("goals", {}) or {}
    cards = stat.get("cards", {}) or {}
    penalty = stat.get("penalty", {}) or {}

    return {
        "nome_api": player.get("name"),
        "squadra_api": (entry.get("team") or {}).get("name") if "team" in entry else None,
        "ruolo": ruolo,
        "pv": games.get("appearences"),
        "mv": games.get("rating") and round(float(games["rating"]), 2),
        "fm": compute_fm_stimata(stat, ruolo),
        "gol": goals.get("total"),
        "golSub": goals.get("conceded"),
        "rigSegn": penalty.get("scored"),
        "rigTir": (penalty.get("scored") or 0) + (penalty.get("missed") or 0),
        "rigParati": penalty.get("saved"),
        "assist": goals.get("assists"),
        "amm": cards.get("yellow"),
        "esp": cards.get("red"),
    }


def load_quotazioni() -> list:
    with open(QUOTAZIONI_PATH, encoding="utf-8") as f:
        return json.load(f)


def merge(quotazioni: list, api_rows: list) -> list:
    by_name = {}
    for row in api_rows:
        if row and row.get("nome_api"):
            by_name[normalize_name(row["nome_api"])] = row

    merged = []
    matched = 0
    for p in quotazioni:
        key = normalize_name(p["nome"])
        stat = by_name.get(key)
        out = dict(p)  # id, ruolo, ruoloLabel, nome, squadra, qtA, fvm
        if stat:
            matched += 1
            out.update({
                "pv": stat["pv"],
                "mv": stat["mv"],
                "fm": stat["fm"],
                "gol": stat["gol"],
                "golSub": stat["golSub"],
                "rigSegn": stat["rigSegn"],
                "rigTir": stat["rigTir"],
                "rigParati": stat["rigParati"],
                "assist": stat["assist"],
                "amm": stat["amm"],
                "esp": stat["esp"],
                "hasStats": stat["fm"] is not None,
            })
        else:
            out.update({
                "pv": None, "mv": None, "fm": None, "gol": None, "golSub": None,
                "rigSegn": None, "rigTir": None, "rigParati": None,
                "assist": None, "amm": None, "esp": None, "hasStats": False,
            })
        merged.append(out)

    print(f"Abbinati con statistiche API-Football: {matched} / {len(quotazioni)}")
    return merged


def main():
    session = get_session()
    print(f"Scarico statistiche Serie A (league={LEAGUE_ID}, season={SEASON})...")
    raw = fetch_all_players(session)
    print(f"Totale voci ricevute dall'API: {len(raw)}")

    api_rows = [extract_player_row(e) for e in raw]
    api_rows = [r for r in api_rows if r]

    quotazioni = load_quotazioni()
    merged = merge(quotazioni, api_rows)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=1)
    print(f"Scritto {OUTPUT_PATH} ({len(merged)} giocatori)")


if __name__ == "__main__":
    main()
