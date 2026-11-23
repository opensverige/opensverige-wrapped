import os
import secrets
import hmac
import hashlib
import base64
from collections import Counter, defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo
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
    response.headers["Referrer-Policy"] = "same-origin"
    return response


def form_token():
    key = request.cookies.get("osw_access", "").encode()
    return hmac.new(key, b"osw:generate-year", hashlib.sha256).hexdigest()


@app.route("/")
def home():
    user = current_user()
    member = None
    if user:
        profile = next((entry.get("identity_data") or {} for entry in user.get("identities", [])
                        if entry.get("provider") == "discord"), {})
        member = (profile.get("preferred_username") or profile.get("user_name")
                  or profile.get("full_name") or user["user_metadata"].get("full_name")
                  or "Discord-medlem")
    return render_template("index.html", csrf=form_token() if user else None, member=member)


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


def authenticated_member():
    if not request.cookies.get("osw_access") or not secrets.compare_digest(form_token(), request.form.get("csrf", "")):
        abort(403)
    user = current_user()
    if not user:
        return redirect("/login")
    uid = discord_identity(user)
    if not os.getenv("DISCORD_BOT_TOKEN"):
        abort(503, "Återblicken väntar på botens anslutning till OpenSverige.")
    try:
        member = api(f"/guilds/{GUILD}/members/{uid}", "Bot " + os.environ["DISCORD_BOT_TOKEN"])
    except requests.HTTPError as exc:
        if exc.response.status_code == 404:
            abort(403, "Återblicken är till för medlemmar i OpenSverige.")
        raise
    return member


@app.post("/year")
def year():
    member = authenticated_member()
    if not isinstance(member, dict):
        return member
    uid = member["user"]["id"]
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

# Cache server metadata briefly; the requesting member is fetched for every request.
from time import monotonic
from threading import Lock

_catalog_lock = Lock()
_catalog = None
_catalog_until = 0


def channel_catalog():
    global _catalog, _catalog_until
    with _catalog_lock:
        if monotonic() >= _catalog_until:
            auth = "Bot " + os.environ["DISCORD_BOT_TOKEN"]
            guild = api(f"/guilds/{GUILD}", auth)
            channels = api(f"/guilds/{GUILD}/channels", auth)
            bot = api(f"/guilds/{GUILD}/members/1574347988728414309", auth)
            _catalog = guild, channels, bot
            _catalog_until = monotonic() + 15
        return _catalog


def can_read_history(member, guild, channel):
    uid = member["user"]["id"]
    if uid == guild["owner_id"]:
        return True
    roles = set(member["roles"])
    permissions = 0
    for role in guild["roles"]:
        if role["id"] == GUILD or role["id"] in roles:
            permissions |= int(role["permissions"])
    if permissions & 8:
        return True
    # Discord applies @everyone, combined roles, then the member overwrite.
    layers = [[0, 0] for _ in range(3)]
    for overwrite in channel["permission_overwrites"]:
        target = overwrite["id"]
        if target == GUILD:
            layer = layers[0]
        elif overwrite["type"] == 0 and target in roles:
            layer = layers[1]
        elif overwrite["type"] == 1 and target == uid:
            layer = layers[2]
        else:
            continue
        layer[0] |= int(overwrite["deny"])
        layer[1] |= int(overwrite["allow"])
    for deny, allow in layers:
        permissions = (permissions & ~deny) | allow
    required = (1 << 10) | (1 << 16)
    if channel["type"] in (2, 13):
        required |= 1 << 20
    return permissions & required == required


def readable_channels(member):
    guild, channels, bot = channel_catalog()
    return {c["id"]: c["name"] for c in sorted(channels, key=lambda c: c.get("position", 0))
            if c["type"] in (0, 2, 5, 13) and can_read_history(member, guild, c)
            and can_read_history(bot, guild, c)}


@app.post("/data")
def data():
    member = authenticated_member()
    if not isinstance(member, dict):
        return member
    profile = member["user"]
    def local_date(value):
        if value:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(ZoneInfo("Europe/Stockholm")).date()
        return "Saknas"
    rows = {
        "Användarnamn": profile["username"],
        "Discord-ID": profile["id"],
        "Visningsnamn": profile.get("global_name") or profile["username"],
        "Servernamn på medlemmen": member.get("nick") or "Inget smeknamn",
        "Gick med i OpenSverige": local_date(member.get("joined_at")),
        "Tilldelade roller": len(member.get("roles", [])),
        "Boostar sedan": local_date(member.get("premium_since")),
    }
    return render_template("data.html", rows=rows, channels=readable_channels(member), csrf=form_token())


@app.post("/data/messages")
def data_messages():
    member = authenticated_member()
    if not isinstance(member, dict):
        return {"error": "Logga in igen."}, 401
    channel = request.form.get("channel")
    cursor = request.form.get("before") or str((1798758000000 - 1420070400000) << 22)
    if channel not in readable_channels(member):
        abort(403)
    if not cursor.isascii() or not cursor.isdigit() or len(cursor) > 20:
        abort(400)
    response = requests.get(f"{API}/channels/{channel}/messages",
                            headers={"Authorization": "Bot " + os.environ["DISCORD_BOT_TOKEN"]},
                            params={"limit": 100, "before": cursor}, timeout=20)
    if response.status_code == 429:
        return {"retry": max(1, float(response.json()["retry_after"]))}, 429
    response.raise_for_status()
    batch = response.json()
    uid = member["user"]["id"]
    days = Counter()
    replies = reactions = 0
    cutoff = False
    for msg in batch:
        day = datetime.fromisoformat(msg["timestamp"].replace("Z", "+00:00")).astimezone(ZoneInfo("Europe/Stockholm")).date()
        if day.year < 2026:
            cutoff = True
        if day.year != 2026 or msg["author"]["id"] != uid or msg["type"] not in (0, 19):
            continue
        days[day.isoformat()] += 1
        replies += int(msg["type"] == 19)
        reactions += sum(item["count"] for item in msg.get("reactions", []))
    return {"days": days, "replies": replies, "reactions": reactions,
            "next": batch[-1]["id"] if len(batch) == 100 and not cutoff else None}
