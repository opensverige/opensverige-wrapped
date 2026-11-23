import re
from collections import Counter
from datetime import datetime
from zoneinfo import ZoneInfo
import emoji as unicode_emoji

CUSTOM_EMOJI = re.compile(r"<a?:([A-Za-z0-9_]+):([0-9]+)>")

YEAR_PHRASES = {
    "god morgon": re.compile(r"\bgod\s*morgon\b", re.IGNORECASE),
    "bygg skiten": re.compile(r"\bbygg\s+skiten\b", re.IGNORECASE),
}

PHRASE_WORD = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*", re.UNICODE)
PHRASE_BREAK = re.compile(r"https?://\S+|```[\s\S]*?(?:```|$)|`[^`\n]*`|<[^>\n]+>|[.!?,:;\n\r]", re.IGNORECASE)

def message_phrases(content):
    """Count a phrase at most once in each message, even if it is repeated."""
    result = set()
    for segment in PHRASE_BREAK.split(content.casefold()):
        words = PHRASE_WORD.findall(segment)
        for size in range(2, min(5, len(words)) + 1):
            result.update(" ".join(words[i:i+size]) for i in range(len(words)-size+1))
    return result

def written_emojis(content):
    for match in CUSTOM_EMOJI.finditer(content):
        yield f":{match[1]}:·{match[2]}"
    for item in unicode_emoji.emoji_list(CUSTOM_EMOJI.sub("", content)):
        yield item["emoji"].replace("\ufe0f", "")

def summarize(batch, uid):
    days = Counter()
    replies = reactions = 0
    written = Counter()
    phrases = Counter()
    discovered = Counter()
    quiet_posts = []
    highlights = {}
    cutoff = False
    for msg in batch:
        day = datetime.fromisoformat(msg["timestamp"].replace("Z", "+00:00")).astimezone(ZoneInfo("Europe/Stockholm")).date()
        if day.year < 2026:
            cutoff = True
        if day.year != 2026 or msg["author"]["id"] != uid or msg["type"] not in (0, 19):
            continue
        days[day.isoformat()] += 1
        content = msg.get("content") or ""
        discovered.update(message_phrases(content))
        written.update(written_emojis(content))
        for phrase, pattern in YEAR_PHRASES.items():
            phrases[phrase] += len(pattern.findall(content))
        replies += int(msg["type"] == 19)
        emoji = {item["emoji"]["name"]: item["count"] for item in msg.get("reactions", [])
                 if item["emoji"].get("name")}
        total = sum(item["count"] for item in msg.get("reactions", []))
        reactions += total
        line = content.strip()
        if total <= 1 and 5 <= len(line) <= 350 and not re.search(r"https?://|<[@#]|@everyone|@here|^`|^>", line, re.I | re.M):
            quiet_posts.append({"id":msg["id"], "text":line, "reactions":total})
        scores = {
            "reaction": total,
            "laugh": emoji.get("😂", 0) + emoji.get("🤣", 0),
            "sticker": int(bool(msg.get("sticker_items"))),
            "pin": int(bool(msg.get("pinned"))),
        }
        for kind, score in scores.items():
            if score and score > highlights.get(kind, {}).get("score", 0):
                highlights[kind] = {"score":score, "date":day.isoformat(), "id":msg["id"],
                                    "emoji":sorted(emoji.items(), key=lambda pair: -pair[1])[:3]}
    return {"days": days, "replies": replies, "reactions": reactions, "highlights":highlights, "written_emojis":written, "phrases": phrases, "discovered": discovered, "quiet_posts":quiet_posts,
            "next": batch[-1]["id"] if len(batch) == 100 and not cutoff else None}

