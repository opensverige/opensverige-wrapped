import asyncio
import logging
import os

import discord
from psycopg.types.json import Jsonb
import history
from history_stats import summarize

LOG = logging.getLogger("osw.history")
FIELDS = ("id","type","timestamp","edited_timestamp","content","reactions","sticker_items",
          "pinned","attachments","embeds","message_reference","flags")


async def sync_history(client,guild_id):
    await client.wait_until_ready()
    await asyncio.to_thread(history.ensure_schema)
    import psycopg
    async with await psycopg.AsyncConnection.connect(os.environ["OSW_DATABASE_URL"],autocommit=True) as db:
        while True:
            async with db.transaction():
                cursor = await db.execute("""select member_id,channel_id,target_id,completed_id,
                    upper_id,cursor_id from public.osw_history_jobs
                    where completed_id<target_id and available_at<=now()
                    order by available_at for update skip locked limit 1""")
                job = await cursor.fetchone()
                if job:
                    uid,ch,target,done,upper,before = job
                    try:
                        guild = client.get_guild(guild_id)
                        channel = guild.get_channel(int(ch))
                        member = await guild.fetch_member(int(uid))
                        perms = channel.permissions_for(member) if channel else None
                        if not perms or not perms.view_channel or not perms.read_message_history:
                            raise PermissionError()
                        upper = upper or target
                        batch = await client.http.logs_from(int(ch),100,before=before or upper+1)
                        lower = max(done,history.START-1)
                        own = [m for m in batch if int(m["id"])>lower and m["author"]["id"]==uid and m["type"] in (0,19)]
                        if own:
                            async with db.cursor() as cur:
                                await cur.executemany("""insert into public.osw_member_messages
                                    (member_id,channel_id,message_id,message) values(%s,%s,%s,%s)
                                    on conflict(member_id,channel_id,message_id) do update set message=excluded.message""",
                                    [(uid,ch,int(m["id"]),Jsonb({k:m[k] for k in FIELDS if k in m})) for m in own])
                            stats = summarize(own,uid)
                            stats.pop("next",None)
                            await db.execute("insert into public.osw_history_results(member_id,channel_id,stats) values(%s,%s,%s)",(uid,ch,Jsonb(stats)))
                        end = len(batch)<100 or int(batch[-1]["id"])<=lower+1
                        await db.execute("""update public.osw_history_jobs set completed_id=%s,upper_id=%s,
                            cursor_id=%s,attempts=0,available_at=now() where member_id=%s and channel_id=%s""",
                            (upper if end else done,None if end else upper,None if end else int(batch[-1]["id"]),uid,ch))
                    except (discord.NotFound,discord.Forbidden,PermissionError):
                        await db.execute("delete from public.osw_history_jobs where member_id=%s and channel_id=%s",(uid,ch))
                        for table in ("osw_member_messages","osw_history_results"):
                            await db.execute(f"delete from public.{table} where member_id=%s and channel_id=%s",(uid,ch))
                    except discord.HTTPException:
                        await db.execute("""update public.osw_history_jobs set attempts=attempts+1,
                            available_at=now()+interval '20 seconds' where member_id=%s and channel_id=%s""",(uid,ch))
            if not job:
                await asyncio.sleep(2)
