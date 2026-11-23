import os
import secrets
import hashlib
import base64
from collections import Counter, defaultdict
from datetime import datetime
from urllib.parse import urlencode

import requests
from flask import Flask, abort, redirect, render_template, request

app = Flask(__name__)
SUPABASE = "https://jocwffhmrxgwjwatavoe.supabase.co/auth/v1"
PUBLIC_KEY = "sb_publishable_1QKfVj53e5SW2nKAnItt9Q_YPerc0I9"
CALLBACK = os.getenv("OSW_CALLBACK_URL", "https://opensverige-wrapped.vercel.app/callback")
COOKIE = dict(httponly=True, secure=CALLBACK.startswith("https://"), samesite="Lax", path="/")


def discord_identity(user):
    for identity in user.get("identities", []):
        if identity.get("provider") == "discord":
            return identity["identity_data"]["sub"]
    abort(403, "Logga in med Discord för att öppna ditt år.")


def current_user():
    token = request.cookies.get("osw_access")
    if not token:
        return None
    response = requests.get(SUPABASE + "/user", headers={"apikey": PUBLIC_KEY,
                            "Authorization": "Bearer " + token}, timeout=15)
    if response.status_code in (401, 403):
        return None
    response.raise_for_status()
    return response.json()


GUILD = "1466847548864987289"
CHANNELS = {"1466847549330559160": "general", "1479938876348039310": "bygg-skiten"}
API = "https://discord.com/api/v10"


def api(path, authorization, params=None):
    response = requests.get(API + path, headers={"Authorization": authorization}, params=params, timeout=20)
    if response.status_code == 429:
        abort(503, "Discord får många anrop just nu. Försök igen om en stund.")
    response.raise_for_status()
    return response.json()


@app.after_request
def private(response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.route("/")
def home():
    user = current_user()
    return render_template("index.html", member=user and user["user_metadata"].get("full_name", "Discord-medlem"))


@app.route("/login")
def login():
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    response = redirect(SUPABASE + "/authorize?" + urlencode(dict(
        provider="discord", redirect_to=CALLBACK, scopes="guilds.members.read",
        code_challenge=challenge, code_challenge_method="s256")))
    response.set_cookie("osw_verifier", verifier, max_age=600, **COOKIE)
    return response


@app.route("/callback")
def callback():
    verifier = request.cookies.get("osw_verifier")
    code = request.args.get("code")
    if not verifier or not code:
        abort(400, "Inloggningen avbröts eller har gått ut. Starta om från startsidan.")
    exchange = requests.post(SUPABASE + "/token", params={"grant_type": "pkce"},
                             headers={"apikey": PUBLIC_KEY},
                             json={"auth_code": code, "code_verifier": verifier}, timeout=15)
    if exchange.status_code in (400, 401, 403):
        abort(400, "Inloggningslänken har gått ut. Logga in igen.")
    exchange.raise_for_status()
    tokens = exchange.json()
    uid = discord_identity(tokens["user"])
    try:
        member = api(f"/users/@me/guilds/{GUILD}/member", "Bearer " + tokens["provider_token"])
    except requests.HTTPError as exc:
        if exc.response.status_code in (403, 404):
            abort(403, "Återblicken är till för medlemmar i OpenSverige.")
        raise
    if member["user"]["id"] != uid:
        abort(403)
    response = redirect("/")
    response.delete_cookie("osw_verifier", **COOKIE)
    response.set_cookie("osw_access", tokens["access_token"], max_age=min(1800, tokens["expires_in"]), **COOKIE)
    return response


def cards(uid):
    auth = "Bot " + os.environ["DISCORD_BOT_TOKEN"]
    days = defaultdict(set)
    own = {}
    replies = Counter()
    for channel in CHANNELS:
        before = (int(datetime.fromisoformat("2027-01-01T00:00:00+01:00").timestamp()*1000)-1420070400000) << 22
        while True:
            batch = api(f"/channels/{channel}/messages", auth, {"limit":100, "before":before})
            for msg in batch:
                utc = datetime.fromisoformat(msg["timestamp"].replace("Z","+00:00"))
                from zoneinfo import ZoneInfo
                day = utc.astimezone(ZoneInfo("Europe/Stockholm")).date()
                if day.year != 2026 or msg["author"].get("bot"):
                    continue
                if msg["author"]["id"] == uid and msg["type"] in (0,19):
                    days[channel].add(day)
                    own[msg["id"]] = channel
                elif msg["author"]["id"] != uid and msg["type"] == 19:
                    replies[(msg.get("message_reference") or {}).get("message_id")] += 1
            if len(batch)<100 or batch[-1]["timestamp"][:4] < "2026":
                break
            before = batch[-1]["id"]
    if not own:
        return [], None
    peak=max(map(len, days.values()))
    best=max(own,key=lambda k:(replies[k],int(k)))
    return [(str(len(set.union(*days.values()))),"dagar skrev du i våra två pilotkanaler"),
            (" · ".join("#"+CHANNELS[c] for c in days if len(days[c])==peak),f"din hemmaplan under {peak} dagar"),
            (str(replies[best]),"direkta svar på ditt mest besvarade inlägg")], (
            f"https://discord.com/channels/{GUILD}/{own[best]}/{best}" if replies[best] else None)


@app.post("/year")
def year():
    if request.headers.get("Origin") != CALLBACK.rsplit("/", 1)[0]:
        abort(403)
    user = current_user()
    if not user:
        return redirect("/login")
    uid = discord_identity(user)
    if not os.getenv("DISCORD_BOT_TOKEN"):
        abort(503, "Återblicken väntar på botens anslutning till OpenSverige.")
    try:
        api(f"/guilds/{GUILD}/members/{uid}", "Bot " + os.environ["DISCORD_BOT_TOKEN"])
    except requests.HTTPError as exc:
        if exc.response.status_code == 404:
            abort(403, "Återblicken är till för medlemmar i OpenSverige.")
        raise
    result, link = cards(uid)
    return render_template("index.html", result=result, link=link)


@app.route("/demo")
def demo():
    return render_template("index.html", demo=True, result=[("47","aktiva dagar"),("#bygg-skiten","din hemmaplan under 32 dagar"),("12","direkta svar på ditt mest besvarade inlägg")])


@app.errorhandler(requests.RequestException)
def unavailable(error):
    return render_template("index.html", problem="Discord kunde inte leverera uppgifterna. Kontrollera appens läsåtkomst eller försök igen."), 502


from werkzeug.exceptions import HTTPException
@app.errorhandler(HTTPException)
def issue(error):
    return render_template("index.html", problem=error.description), error.code
