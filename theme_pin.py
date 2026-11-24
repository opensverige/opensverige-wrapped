"""PIN authentication scoped to the shared theme studio."""
import hashlib
import hmac
import os
import re
import secrets

from flask import abort, g, make_response, redirect, render_template, request, url_for
from werkzeug.security import check_password_hash
from worker import history

COOKIE = "__Host-osw_theme"
MAX_AGE = 2 * 60 * 60
STUDIO = "osw:theme-studio"


def verifier():
    return os.environ.get("OSW_THEME_PIN_HASH", "").strip()


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def session():
    if hasattr(g,"theme_session"):
        return g.theme_session
    raw=request.cookies.get(COOKIE,"")
    key=verifier()
    g.theme_session=None
    if key and re.fullmatch(r"[0-9a-f]{64}", raw):
        with history.connect() as db:
            if db.execute("""select 1 from public.osw_generated_results
                    where member_id=%s and kind='pin-session' and cache_key=%s
                    and result=to_jsonb(%s::text) and saved_at>now()-make_interval(secs=>%s)""",
                    (STUDIO,digest(raw),digest(key),MAX_AGE)).fetchone():
                g.theme_session=raw
    return g.theme_session


def csrf(raw):
    return hmac.new(raw.encode(),b"osw-theme-edit",hashlib.sha256).hexdigest()


def check_csrf(raw):
    if not hmac.compare_digest(csrf(raw).encode(), request.form.get("csrf","").encode()):
        abort(403)


def reserve_attempt(db,bucket,limit):
    return db.execute("""insert into public.osw_generated_results as l(member_id,kind,cache_key,result)
        values (%s,'pin-limit',%s,'1') on conflict(member_id,kind,cache_key) do update
        set result=to_jsonb(case when l.saved_at<=now()-interval '15 minutes' then 1 else l.result::int+1 end),
            saved_at=case when l.saved_at<=now()-interval '15 minutes' then now() else l.saved_at end
        where l.saved_at<=now()-interval '15 minutes' or l.result::int<%s returning result""",
        (STUDIO,bucket,limit)).fetchone()


def install(app):
    @app.route("/admin/pin",methods=["GET","POST"])
    def theme_pin_login():
        key=verifier()
        if not key:
            abort(404)
        if request.method=="GET":
            if session():
                return redirect(url_for("theme_admin"))
            return render_template("theme-pin.html")
        request.max_content_length=4096
        pin=request.form.get("pin","")
        with history.connect() as db:
            db.execute("""delete from public.osw_generated_results where member_id=%s
                       and kind='pin-limit' and saved_at<=now()-interval '15 minutes'""",(STUDIO,))
            address=request.remote_addr or "unknown"
            if os.environ.get("VERCEL")=="1":
                address=request.headers.get("X-Vercel-Forwarded-For",address).split(",")[0].strip()
            bucket=hmac.new(key.encode(),address.encode(),hashlib.sha256).hexdigest()
            if not reserve_attempt(db,bucket,8) or not reserve_attempt(db,"all",150):
                return render_template("theme-pin.html",error="För många försök. Prova igen om 15 minuter."),429,{"Retry-After":"900"}
            if not re.fullmatch(r"[0-9]{10}",pin) or not check_password_hash(key,pin):
                return render_template("theme-pin.html",error="Fel PIN-kod."),401
            db.execute("""delete from public.osw_generated_results where member_id=%s
                       and kind='pin-limit' and cache_key=%s""",(STUDIO,bucket))
            raw=secrets.token_hex(32)
            db.execute("""delete from public.osw_generated_results where member_id=%s and kind='pin-session'
                       and (saved_at<=now()-make_interval(secs=>%s) or result<>to_jsonb(%s::text))""",
                       (STUDIO,MAX_AGE,digest(key)))
            history.save_generated(db,STUDIO,"pin-session",digest(raw),digest(key))
        response=make_response(redirect(url_for("theme_admin"),code=303))
        response.set_cookie(COOKIE,raw,max_age=MAX_AGE,secure=True,httponly=True,samesite="Strict",path="/")
        return response

    @app.post("/admin/pin/logout")
    def theme_pin_logout():
        raw=session()
        if raw:
            check_csrf(raw)
            with history.connect() as db:
                db.execute("""delete from public.osw_generated_results where member_id=%s
                           and kind='pin-session' and cache_key=%s""",(STUDIO,digest(raw)))
        response=make_response(redirect(url_for("theme_pin_login"),code=303))
        response.delete_cookie(COOKIE,path="/",secure=True,httponly=True,samesite="Strict")
        return response
