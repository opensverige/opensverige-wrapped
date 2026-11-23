import os
import time
from pathlib import Path
from functools import lru_cache

import psycopg
from psycopg.types.json import Jsonb

# 2026 in Europe/Stockholm, expressed as Discord snowflake boundaries.
START = (1767222000000 - 1420070400000) << 22
END = (1798758000000 - 1420070400000) << 22


@lru_cache(maxsize=1)
def ensure_schema():
    with psycopg.connect(os.environ["OSW_DATABASE_URL"],connect_timeout=8) as db:
        if not db.execute("select to_regclass('public.osw_generated_results')").fetchone()[0]:
            db.execute("select pg_advisory_xact_lock(816330021)")
            db.execute(Path(__file__).with_name("history.sql").read_text(encoding="utf-8-sig"))


def connect():
    ensure_schema()
    return psycopg.connect(os.environ["OSW_DATABASE_URL"],connect_timeout=8)


def enqueue(db, uid, channels):
    target = min(END-1, ((int(time.time()*1000)-1420070400000)<<22)-1)
    db.execute("""insert into public.osw_history_jobs(member_id,channel_id,target_id)
        select %s,unnest(%s::text[]),%s on conflict(member_id,channel_id)
        do update set target_id=greatest(osw_history_jobs.target_id,excluded.target_id)""",
        (uid,channels,target))


def results(db, uid, channels, after):
    # A consistent snapshot prevents a last batch being skipped during completion.
    jobs = db.execute("""select channel_id,completed_id>=target_id,completed_id>0,attempts
        from public.osw_history_jobs where member_id=%s and channel_id=any(%s)""",
        (uid,channels)).fetchall()
    rows = db.execute("""select id,channel_id,stats from public.osw_history_results
        where member_id=%s and channel_id=any(%s) and id>%s order by id limit 5""",
        (uid,channels,after)).fetchall()
    return {"pages":[{"id":str(i),"channel":ch,"stats":stats} for i,ch,stats in rows],
            "jobs":{ch:{"done":done,"baseline":baseline,"retry":attempts>0} for ch,done,baseline,attempts in jobs},
            "more":len(rows)==5}


def get_generated(db,uid,kind,key):
    row = db.execute("select result from public.osw_generated_results where member_id=%s and kind=%s and cache_key=%s",(uid,kind,key)).fetchone()
    return row[0] if row else None


def save_generated(db,uid,kind,key,result):
    db.execute("""insert into public.osw_generated_results(member_id,kind,cache_key,result)
        values(%s,%s,%s,%s) on conflict(member_id,kind,cache_key) do update
        set result=excluded.result,saved_at=now()""",(uid,kind,key,Jsonb(result)))
