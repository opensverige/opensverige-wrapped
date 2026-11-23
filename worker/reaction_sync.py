"""Refresh received reactions from Discord's current message snapshot."""

import os
from collections import Counter
from datetime import datetime
from zoneinfo import ZoneInfo

import discord
import psycopg
from psycopg.types.json import Jsonb


import re


STOCKHOLM = ZoneInfo("Europe/Stockholm")


def reaction_fields(messages):
    highlights = {}
    quiet = []
    total = 0
    for message in messages:
        items = message.get("reactions", [])
        count = sum(item["count"] for item in items)
        total += count
        emojis = Counter()
        for item in items:
            emojis[item["emoji"]["name"]] += item["count"]
        text = (message.get("content") or "").strip()
        if count <= 1 and 5 <= len(text) <= 350 and not re.search(r"https?://|<[@#]|@everyone|@here|^`|^>", text, re.I | re.M):
            quiet.append({"id":message["id"], "text":text, "reactions":count})
        for kind, score in (("reaction",count), ("laugh",emojis["😂"] + emojis["🤣"])):
            if score and score > highlights.get(kind, {}).get("score", 0):
                date = datetime.fromisoformat(message["timestamp"]).astimezone(STOCKHOLM).date()
                highlights[kind] = dict(score=score, date=date.isoformat(), id=message["id"], emoji=emojis.most_common(3))
    return total, quiet, highlights


async def refresh(client, db, channel, mid):
    cur = await db.execute("select member_id from public.osw_member_messages where channel_id=%s and message_id=%s", (str(channel),mid))
    owner = await cur.fetchone()
    if not owner:
        return
    uid = owner[0]
    fresh = await client.http.get_message(channel, mid)
    reactions = fresh.get("reactions", [])
    async with db.transaction():
        # Serialize with history ingestion, which locks this same job before writing a page.
        lock = await db.execute("select 1 from public.osw_history_jobs where member_id=%s and channel_id=%s for update",(uid,str(channel)))
        if not await lock.fetchone():
            return
        updated = await db.execute("""update public.osw_member_messages
            set message=jsonb_set(message,'{reactions}',%s)
            where member_id=%s and channel_id=%s and message_id=%s
            and coalesce(message->'reactions','[]'::jsonb)<>%s""",(Jsonb(reactions),uid,str(channel),mid,Jsonb(reactions)))
        if not updated.rowcount:
            return
        params = (uid,str(channel))
        cur = await db.execute("""select message from public.osw_member_messages
            where member_id=%s and channel_id=%s order by message_id desc""",params)
        messages = [row[0] for row in await cur.fetchall()]
        cur = await db.execute("""select id,stats from public.osw_history_results
            where member_id=%s and channel_id=%s order by id""",params)
        pages = await cur.fetchall()
        offset = 0
        for page_id, stats in pages:
            end = offset + sum(stats["days"].values())
            total, quiet, leaders = reaction_fields(messages[offset:end])
            offset = end
            highlights = {k:v for k,v in stats["highlights"].items() if k not in ("reaction","laugh")}
            highlights.update(leaders)
            if (total,quiet,highlights) != (stats["reactions"],stats["quiet_posts"],stats["highlights"]):
                stats.update(reactions=total, quiet_posts=quiet, highlights=highlights)
                await db.execute("update public.osw_history_results set stats=%s where id=%s",(Jsonb(stats),page_id))
        if offset != len(messages):
            raise ValueError("History page counts differ from stored messages")


async def collect(client):
    async with await psycopg.AsyncConnection.connect(os.environ["OSW_DATABASE_URL"],autocommit=True) as db:
        while True:
            channel, mid = await client.reaction_queue.get()
            client.reaction_pending.discard((channel,mid))
            try:
                await refresh(client, db, channel, mid)
            except (discord.NotFound, discord.Forbidden):
                continue
            except (discord.HTTPException, psycopg.Error):
                client.queue_reaction(channel,mid)
                raise
