"""OpenSverige voice collector. One session-mode Postgres connection owns the lease."""
import asyncio
import logging
import os
from datetime import datetime, timezone
from uuid import uuid4

from reaction_sync import collect
from history_runner import sync_history
import discord
import psycopg

GUILD = 1466847548864987289
LOG = logging.getLogger("osw.voice")


class VoiceCollector(discord.Client):
    def __init__(self, db):
        intents = discord.Intents.none()
        intents.guilds = intents.voice_states = intents.guild_reactions = True
        super().__init__(intents=intents)
        self.db = db
        self.reaction_queue = asyncio.Queue()
        self.reaction_pending = set()
        self.active = {}
        self.pending = {}
        self.tracking = False

    def queue_reaction(self, channel, mid):
        key = (channel, mid)
        if key not in self.reaction_pending:
            self.reaction_pending.add(key)
            self.reaction_queue.put_nowait(key)

    async def on_raw_reaction_add(self, event):
        if event.guild_id == GUILD:
            self.queue_reaction(event.channel_id, event.message_id)

    on_raw_reaction_remove = on_raw_reaction_add
    on_raw_reaction_clear = on_raw_reaction_add
    on_raw_reaction_clear_emoji = on_raw_reaction_add

    def observe(self, uid, channel, streaming, now, *, snapshot=False):
        old = self.active.get(uid)
        if old:
            key, previous_channel, previous_stream, start, arrival = old
            self.pending[key] = (key, str(uid), str(previous_channel), start, now, previous_stream, arrival)
            if (previous_channel, previous_stream) == (channel, streaming):
                return
            del self.active[uid]
        if channel is not None:
            arrival = not snapshot and (old is None or old[1] != channel)
            self.active[uid] = (uuid4(), channel, streaming, now, arrival)

    def reset(self):
        self.tracking = False
        self.active.clear()

    def snapshot(self):
        self.reset()
        guild = self.get_guild(GUILD)
        if not guild or guild.unavailable:
            return
        now = datetime.now(timezone.utc)
        for channel in [*guild.voice_channels, *guild.stage_channels]:
            for member in channel.members:
                if not member.bot and member.voice:
                    self.observe(member.id, channel.id, bool(member.voice.self_stream), now, snapshot=True)
        self.tracking = True
        LOG.info("Discord voice collection connected; guild state synchronized")

    async def on_ready(self):
        self.snapshot()

    async def on_resumed(self):
        self.snapshot()

    async def on_disconnect(self):
        self.reset()

    async def on_guild_unavailable(self, guild):
        if guild.id == GUILD:
            self.reset()

    async def on_guild_available(self, guild):
        if guild.id == GUILD and not self.tracking:
            self.snapshot()

    async def on_voice_state_update(self, member, before, after):
        if member.guild.id == GUILD and not member.bot and self.tracking:
            self.observe(member.id, after.channel.id if after.channel else None,
                         bool(after.self_stream), datetime.now(timezone.utc))

    async def flush(self):
        if self.tracking:
            now = datetime.now(timezone.utc)
            for uid, (_, channel, stream, _, _) in list(self.active.items()):
                self.observe(uid, channel, stream, now)
        rows = list(self.pending.values())
        async with self.db.cursor() as cur:
            # Check the lease connection even when nobody is in voice.
            await cur.execute("select 1")
            await cur.executemany("""
                insert into public.osw_voice_segments
                (id,member_id,channel_id,started_at,observed_until,streaming,arrival)
                values (%s,%s,%s,%s,%s,%s,%s)
                on conflict (id) do update set observed_until =
                greatest(osw_voice_segments.observed_until, excluded.observed_until)
            """, rows)
        for row in rows:
            if self.pending.get(row[0]) == row:
                del self.pending[row[0]]

    async def persist(self):
        while True:
            await asyncio.sleep(15)
            await self.flush()


async def main():
    async with await psycopg.AsyncConnection.connect(os.environ["OSW_DATABASE_URL"], autocommit=True) as db:
        cur = await db.execute("select pg_try_advisory_lock(%s)", (GUILD,))
        if not (await cur.fetchone())[0]:
            raise RuntimeError("Another OpenSverige collector is active")
        async with VoiceCollector(db) as client:
            async with asyncio.TaskGroup() as group:
                async def run_sync():
                    while not client.is_ready():
                        await asyncio.sleep(1)
                    while True:
                        try:
                            await sync_history(client,GUILD)
                        except Exception:
                            LOG.exception("History sync interrupted; retrying")
                            await asyncio.sleep(10)
                async def run_reactions():
                    while True:
                        try:
                            await collect(client)
                        except (discord.HTTPException, psycopg.Error, ValueError):
                            LOG.exception("Reaction sync interrupted")
                            await asyncio.sleep(5)
                group.create_task(run_reactions())
                group.create_task(run_sync())
                group.create_task(client.persist())
                group.create_task(client.start(os.environ["DISCORD_BOT_TOKEN"]))


if __name__ == "__main__":
    import sys
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
