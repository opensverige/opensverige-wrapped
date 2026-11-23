import os
import secrets
import time
from collections import Counter, defaultdict
from datetime import datetime
from urllib.parse import urlencode

import requests
from flask import Flask, abort, redirect, render_template, request, session

app = Flask(__name__)
app.secret_key = os.getenv("SESSION_SECRET") or secrets.token_hex(32)
CALLBACK = os.getenv("DISCORD_REDIRECT_URI", "http://127.0.0.1:5080/callback")
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
                  SESSION_COOKIE_SECURE=CALLBACK.startswith("https://"))
CLIENT = "1574347988728414309"
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
    return render_template("index.html")


@app.route("/login")
def login():
    if not all(os.getenv(k) for k in ("DISCORD_CLIENT_SECRET", "DISCORD_BOT_TOKEN", "SESSION_SECRET")):
        abort(503, "Discord-inloggningen väntar på serverkonfiguration. Prova demon under tiden.")
    session.clear()
    session["state"] = secrets.token_urlsafe(32)
    return redirect("https://discord.com/oauth2/authorize?" + urlencode(dict(
        client_id=CLIENT, redirect_uri=CALLBACK, response_type="code",
        scope="identify guilds.members.read", state=session["state"])))


@app.route("/callback")
def callback():
    state = session.pop("state", None)
    if not state or not secrets.compare_digest(state, request.args.get("state", "")):
        abort(400, "Starta inloggningen igen.")
    if not request.args.get("code"):
        return redirect("/")
    response = requests.post(API + "/oauth2/token", data=dict(grant_type="authorization_code",
        code=request.args["code"], redirect_uri=CALLBACK), auth=(CLIENT, os.environ["DISCORD_CLIENT_SECRET"]), timeout=20)
    response.raise_for_status()
    bearer = "Bearer " + response.json()["access_token"]
    try:
        api(f"/users/@me/guilds/{GUILD}/member", bearer)
    except requests.HTTPError as exc:
        if exc.response.status_code in (403, 404):
            abort(403, "Återblicken är till för medlemmar i OpenSverige.")
        raise
    user = api("/users/@me", bearer)
    session.update(uid=user["id"], name=user.get("global_name") or user["username"],
                   csrf=secrets.token_urlsafe(32), until=time.time()+1800)
    return redirect("/")


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
    if session.get("until",0)<time.time():
        session.clear()
        return redirect("/login")
    if not secrets.compare_digest(session["csrf"],request.form.get("csrf","")):
        abort(403)
    result, link = cards(session["uid"])
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
