"""Shared film themes and their immutable soundtracks."""
import base64
import io
import re
import subprocess
import tempfile
from pathlib import Path
from uuid import uuid4

from flask import abort, jsonify, redirect, render_template, request, send_file, url_for
from worker import history
import theme_pin

COLORS = ("green","lime","rust","paper")
STUDIO = theme_pin.STUDIO

def music_record(key, name, frames, asset):
    return dict(id=key,name=name,frames=frames,src=asset or f"/music/{key}")

def initial_catalog(db):
    if db.execute("select to_regclass('public.osw_film_settings')").fetchone()[0]:
        tracks = db.execute("select id,name,frames,asset from public.osw_music_tracks").fetchall()
        themes = db.execute("select id,name,layout,colors,revision,track_id from public.osw_film_themes").fetchall()
        active = db.execute("select active_theme from public.osw_film_settings where singleton").fetchone()[0]
    else:
        tracks = [
            ("original","Byggaråret · ElevenLabs",3420,"/static/year-music.m4a?v=elevenlabs-2026"),
            ("pulse","Puls · Demons instrumentalspår",1440,"/static/pulse.m4a"),
        ]
        themes = [
            ("original","OpenSverige Original","editorial",dict(zip(COLORS,("#215641","#dcff80","#ac3917","#fbfaf7"))),1,"original"),
            ("pulse","OpenSverige Puls","pulse",dict(zip(COLORS,("#2d492d","#d9f36c","#a74730","#f9f2e3"))),1,"pulse"),
        ]
        active = "motion-v3"
    return dict(active=active, tracks={t[0]:music_record(*t) for t in tracks},
                themes={key:dict(id=key,name=name,layout=layout,colors=colors,revision=revision,track_id=track)
                        for key,name,layout,colors,revision,track in themes})


def catalog(db, editing=False):
    # The nonnumeric owner keeps studio records separate from Discord member IDs.
    if editing:
        db.execute("select pg_advisory_xact_lock(816330025)")
    data = history.get_generated(db,STUDIO,"catalog","v1")
    if data is None or "motion-v3" not in data["themes"]:
        if not editing:
            return catalog(db,editing=True)
        if data is None:
            data = initial_catalog(db)
        data["themes"]["motion-v3"] = dict(
            id="motion-v3", name="OpenSverige Motion V3", layout="motion-v3", revision=1,
            colors=dict(green="#2d492d", lime="#d9ff74", rust="#b64a29", paper="#fbf7ef"),
            track_id="original" if "original" in data["tracks"] else None)
        history.save_generated(db,STUDIO,"catalog","v1",data)
    return data


def theme_list(data, active_only=False):
    result = [dict(theme,active=key==data["active"],track=data["tracks"].get(theme["track_id"]))
              for key,theme in data["themes"].items() if not active_only or key==data["active"]]
    return sorted(result,key=lambda theme:(not theme["active"],theme["name"].casefold(),theme["id"]))


def read_themes(db, active_only=False):
    return theme_list(catalog(db), active_only)

def encode_upload(upload):
    import imageio_ffmpeg
    with tempfile.TemporaryDirectory() as folder:
        source=Path(folder)/"source"
        upload.save(source)
        if source.stat().st_size>4_000_000:
            abort(413,"Ljudfilen får vara högst 4 MB.")
        target=Path(folder)/"track.m4a"
        try:
            result=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),"-nostdin","-v","error",
                "-protocol_whitelist","file,pipe","-f","mp3","-i",str(source),"-map","0:a:0","-vn",
                "-t","181","-ar","44100","-ac","2","-c:a","aac","-b:a","144k","-movflags","+faststart",
                "-progress","pipe:1",str(target)],capture_output=True,text=True,timeout=40)
        except subprocess.TimeoutExpired:
            abort(422,"Ljudfilen tog för lång tid att läsa.")
        times=re.findall(r"^out_time_us=(\d+)$",result.stdout,re.M)
        frames=int(times[-1])*20//1_000_000 if times else 0
        if result.returncode or not 20*2<=frames<=20*180+1:
            abort(422,"Välj en läsbar MP3 mellan 2 sekunder och 3 minuter.")
        return frames,target.read_bytes()

def install(app, authenticated_member, is_admin, form_token):
    theme_pin.install(app)
    def editor():
        raw=theme_pin.session()
        if raw:
            if request.method=="POST":
                theme_pin.check_csrf(raw)
            return None
        member=authenticated_member()
        if not isinstance(member,dict):
            if theme_pin.verifier() and request.method=="GET":
                return redirect(url_for("theme_pin_login"))
            return member
        if not is_admin(member):
            if theme_pin.verifier() and request.method=="GET":
                return redirect(url_for("theme_pin_login"))
            abort(403,"Teman hanteras av OpenSveriges Discord-administratörer.")

    @app.route("/admin",methods=["GET","POST"])
    def theme_admin():
        denied=editor()
        if denied is not None:
            return denied
        with history.connect() as db:
            data=catalog(db,editing=request.method=="POST")
            themes=theme_list(data)
            if request.method=="GET":
                tracks=sorted(data["tracks"].values(),key=lambda t:(t["name"].casefold(),t["id"]))
                raw=theme_pin.session()
                return render_template("admin.html",themes=themes,tracks=tracks,pin_login=bool(raw),
                                       csrf=theme_pin.csrf(raw) if raw else form_token())
            form=request.form
            action=form.get("action")
            name=form.get("name","").strip()
            layout=form.get("layout")
            key=form.get("theme")
            source=next((t for t in themes if t["id"]==key),None)
            colors={part:form.get(part,"") for part in COLORS}
            track=form.get("track") or None
            if (action not in ("apply","save","copy") or not source or not 1<=len(name)<=64
                    or layout not in ("editorial","pulse","motion-v3") or not all(re.fullmatch("#[0-9a-fA-F]{6}",v) for v in colors.values())):
                abort(400,"Kontrollera temats namn, format och färger.")
            if track and track not in data["tracks"]:
                abort(400,"Musikspåret finns inte.")
            if action=="copy":
                key=str(uuid4())
                revision=1
            else:
                revision=form.get("revision",type=int)
                if revision!=source["revision"]:
                    abort(409,"Temat har ändrats av en annan redaktör. Ladda om sidan.")
                revision+=1
                if action=="apply":
                    data["active"]=key
            data["themes"][key]=dict(id=key,name=name,layout=layout,colors=colors,track_id=track,revision=revision)
            history.save_generated(db,STUDIO,"catalog","v1",data)
        return redirect(url_for("theme_admin",theme=key,saved="1"),code=303)

    @app.post("/admin/music")
    def upload_music():
        request.max_content_length=4_100_000
        denied=editor()
        if denied is not None:
            return denied
        name=request.form.get("name","").strip()
        upload=request.files.get("audio")
        if not upload or not 1<=len(name)<=64:
            abort(400,"Ge spåret ett namn och välj en MP3.")
        frames,data=encode_upload(upload)
        key=str(uuid4())
        with history.connect() as db:
            library=catalog(db,editing=True)
            library["tracks"][key]=music_record(key,name,frames,None)
            history.save_generated(db,STUDIO,"track-audio",key,base64.b64encode(data).decode("ascii"))
            history.save_generated(db,STUDIO,"catalog","v1",library)
        return jsonify(music_record(key,name,frames,None)),201

    @app.get("/music/<uuid:key>")
    def member_music(key):
        if not theme_pin.session():
            member=authenticated_member()
            if not isinstance(member,dict):
                return member
        with history.connect() as db:
            encoded=history.get_generated(db,STUDIO,"track-audio",str(key))
            audio=base64.b64decode(encoded) if encoded else None
            if audio is None and db.execute("select to_regclass('public.osw_music_tracks')").fetchone()[0]:
                row=db.execute("select audio from public.osw_music_tracks where id=%s and asset is null",(str(key),)).fetchone()
                audio=bytes(row[0]) if row else None
        if audio is None:
            abort(404)
        return send_file(io.BytesIO(audio),mimetype="audio/mp4",conditional=True)
