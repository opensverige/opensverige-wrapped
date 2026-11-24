"""Private, per-member MP4 exports. Only metadata lives in the history database."""
import base64
import hashlib
import hmac
import os
import re
import time
from functools import lru_cache
from urllib.parse import urlencode, urlsplit
from zoneinfo import ZoneInfo

import requests
from flask import abort, redirect, request

from stories import KIND as STORY, VERSIONED_RUNS
from worker import history

FILM = "wrapped-film-v1"
BLOB_API = "https://vercel.com/api/blob"
MAX_BYTES = 64 * 1024 * 1024


def headers():
    token = (os.environ.get("OSW_FILMS_BLOB_READ_WRITE_TOKEN") or os.environ.get("BLOB_READ_WRITE_TOKEN", "")).strip()
    if not token:
        abort(503, "Filmlagringen är inte ansluten.")
    return {"Authorization": "Bearer " + token, "x-api-version": "13"}


def private_location(url, path):
    location = urlsplit(url)
    return (location.scheme == "https" and location.path == "/" + path and
            re.fullmatch(r"[a-zA-Z0-9-]+\.private\.blob\.vercel-storage\.com", location.netloc))


@lru_cache(maxsize=1)
def require_private_store(authorization):
    # A presigned PUT can succeed against a public store. Verify the actual
    # storage hostname before granting the browser access to upload any film.
    path = "wrapped/config/private-store.txt"
    auth = {"Authorization": authorization, "x-api-version": "13"}
    def lookup():
        return requests.get(BLOB_API, headers=auth, params={"url":path}, timeout=15)
    info = lookup()
    if info.status_code == 404:
        requests.put(BLOB_API + "/", params={"pathname":path}, data=b"OpenSverige Wrapped",
                     headers={**auth, "x-vercel-blob-access":"private", "x-add-random-suffix":"0",
                              "x-allow-overwrite":"0", "content-type":"text/plain"}, timeout=15)
        info = lookup()
    if not info.ok or not private_location(info.json().get("url", ""), path):
        abort(503, "Filmer kräver en privat Blob-butik.")


def signed_link(path, operation, url=None, size=None):
    # Vercel Signed URLs. The delegation and signature are safe to send to the
    # browser; the store credential and delegation signing key stay here.
    scope = dict(pathname=path, operations=[operation],
                 validUntil=int(time.time() + (900 if operation == "put" else 1800)) * 1000)
    options = {}
    if operation == "put":
        scope.update(maximumSizeInBytes=size, allowedContentTypes=["video/mp4"])
        options = {"vercel-blob-add-random-suffix": "false", "vercel-blob-allow-overwrite": "false"}
    response = requests.post(BLOB_API + "/signed-token", headers=headers(), json=scope, timeout=15)
    if not response.ok:
        abort(503, "Filmlagringen kunde inte utfärda en länk.")
    keys = response.json()
    fields = {"operation": operation, "pathname": path, **options}
    canonical = "\n".join(sorted(k + "=" + v for k, v in fields.items())).encode()
    signature = hmac.digest(keys["clientSigningToken"].encode(), canonical, hashlib.sha256)
    params = {**options, "vercel-blob-delegation": keys["delegationToken"],
              "vercel-blob-signature": base64.urlsafe_b64encode(signature).rstrip(b"=").decode()}
    if operation == "put":
        url = BLOB_API + "/"
        params["pathname"] = path
    return url + "?" + urlencode(params)


FORMATS = {"editorial": "Redaktionell film", "stats": "Bara statistik"}


def film_format(value):
    if value not in FORMATS:
        abort(400, "Okänt filmformat.")
    return value


def stats_input(stats):
    """Only disclose the aggregates used on screen for this format."""
    def counts(record, fields):
        return {key: record[key] for key in fields
                if type(record.get(key)) is int and record[key] >= 0}

    totals = counts(stats, ("messages", "days", "reactions"))
    activity = counts(stats.get("activity") or {}, ("longestStreak", "replies"))
    voice = counts(stats.get("voice") or {}, ("minutes",))
    months = {key: n for key, n in (stats.get("months") or {}).items()
              if re.fullmatch(r"2026-(?:0[1-9]|1[0-2])", key) and type(n) is int and n >= 0}
    return dict(name=stats["name"], avatar=stats.get("avatar"), format="stats",
                activity=activity, months=months, voice=voice, **totals)


def saved(db, uid, channels):
    rows = db.execute(f"""with runs as ({VERSIONED_RUNS})
        select f.cache_key,f.result,f.saved_at,r.cache_key,r.version,r.result->'channels'
        from public.osw_generated_results f left join runs r on r.cache_key=split_part(f.cache_key,'/',1)
        where f.member_id=%s and f.kind=%s order by f.saved_at desc,f.cache_key""", (uid, STORY, uid, FILM))
    return [dict(key=key, date=when.astimezone(ZoneInfo("Europe/Stockholm")), name=data["name"],
                 run_id=run_id, version=version, format_label=FORMATS[data.get("format", "editorial")])
            for key,data,when,run_id,version,source_channels in rows
            if set(data["channels"]) <= channels.keys() and set(source_channels or []) <= channels.keys()]


def snapshots(db, uid, channels):
    rows = db.execute(f"""with runs as ({VERSIONED_RUNS})
        select cache_key,version,saved_at,result->'channels',result->'count',result->'stats'->'days',
               jsonb_array_length(result->'stories')
        from runs order by version desc""", (uid, STORY))
    return [dict(id=key, version=version, date=when.astimezone(ZoneInfo("Europe/Stockholm")),
                 posts=posts, days=days, stories=stories)
            for key,version,when,required,posts,days,stories in rows if set(required) <= channels.keys()]


def install(app, member_for_request, readable_channels):
    @app.post("/data/films/<uuid:run_id>/<digest>/<action>")
    def save_film(run_id, digest, action):
        member = member_for_request()
        if not isinstance(member, dict):
            return {"error": "Logga in igen för att spara filmen."}, 401
        if not re.fullmatch("[0-9a-f]{64}", digest) or action not in ("upload", "confirm"):
            abort(404)
        selected_format = film_format(request.form.get("format", "editorial"))
        size = request.form.get("size", type=int)
        if not size or not 16 <= size <= MAX_BYTES:
            abort(413)
        uid = member["user"]["id"]
        key = str(run_id) + "/" + digest
        path = f"wrapped/2026/{uid}/{key}.mp4"
        channels = readable_channels(member)
        with history.connect() as db:
            run = history.get_generated(db, uid, STORY, str(run_id))
            if not run or not run["done"] or not set(run["channels"]) <= channels.keys():
                abort(404)
            if history.get_generated(db, uid, FILM, key):
                return {"saved": True}
        if action == "upload":
            require_private_store(headers()["Authorization"])
            return {"url": signed_link(path, "put", size=size)}
        # Resolve the path ourselves and verify the stored object before listing it.
        head = requests.get(BLOB_API, headers=headers(), params={"url": path}, timeout=15)
        if not head.ok:
            abort(409, "Filmen har inte sparats än.")
        metadata = head.json()
        url = metadata["url"]
        if (not private_location(url, path)
                or metadata["pathname"] != path or metadata["size"] != size
                or metadata["contentType"] != "video/mp4"):
            abort(409, "Den privata filmen kunde inte verifieras.")
        with requests.get(url, headers={**headers(), "Range": "bytes=0-15"}, stream=True,
                          allow_redirects=False, timeout=15) as media:
            if media.status_code not in (200, 206) or media.raw.read(12)[4:8] != b"ftyp":
                abort(422, "Filen kunde inte verifieras som MP4.")
        with history.connect() as db:
            history.save_generated(db, uid, FILM, key, dict(url=url, name=run["stats"]["name"],
                                   channels=run["channels"], format=selected_format))
        return {"saved": True}

    @app.get("/filmer/<uuid:run_id>/<digest>")
    def play_film(run_id, digest):
        member = member_for_request()
        if not isinstance(member, dict):
            return member
        if not re.fullmatch("[0-9a-f]{64}", digest):
            abort(404)
        uid = member["user"]["id"]
        with history.connect() as db:
            film = history.get_generated(db, uid, FILM, str(run_id) + "/" + digest)
        if not film or not set(film["channels"]) <= readable_channels(member).keys():
            abort(404)
        path = urlsplit(film["url"]).path.lstrip("/")
        target = signed_link(path, "get", url=film["url"])
        if request.args.get("download") == "1":
            target += "&download=1"
        return redirect(target, code=302)
