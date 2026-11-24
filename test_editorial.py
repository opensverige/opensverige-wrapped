import unittest

from editorial import EDITOR, FACT_CHECK, SCRIPT_REVIEW, edit


class EditorialTest(unittest.TestCase):
    def test_public_captions_are_short_and_keep_verbatim_quotes(self):
        replies = ["I juni berättade du om en app.", " ".join(["ord"] * 13),
                   "Agenten kan testa appar.", "Kan du höra klockan?"]
        originals = dict(enumerate(replies, 1))
        candidates = [dict(title=str(i), sources=[dict(id=str(i), date="2026-03-01", channel="42")])
                      for i in originals]
        def ask(prompt, data):
            if prompt == EDITOR:
                return {"scenes": [dict(title=str(i), story=body, kind="quote" if i==4 else "project",
                                        ids=[str(i)]) for i,body in originals.items()]}
            if prompt == SCRIPT_REVIEW:
                return {"approved": [dict(s,support=s["originals"][0]["text"]) for s in data]}
            return {"verified": [s["index"] for s in data]}
        self.assertEqual([s["story"] for s in edit(candidates, originals, ask)], replies[2:])

    def test_requires_original_quotes_and_verified_nonoverlapping_sources(self):
        originals = {1: "Vi bygger en klocka.", 2: "Här är min demo.", 3: "Klockrent!"}
        candidates = [dict(title=text, sources=[dict(id=str(i), date="2026-03-01", channel="42")])
                      for i, text in originals.items()]

        def scene(kind, body, *ids):
            return dict(kind=kind, title="Klockan", story=body, ids=list(ids))

        def ask(prompt, data):
            if "manusredaktör" in prompt:
                return {"approved": [dict(s,support=s["originals"][0]["text"]) for s in data]}
            if "Faktagranska" in prompt:
                self.assertEqual(len(data), 2)
                return {"verified": [1, False]}
            return {"scenes": [
                scene("quote", "Låter som en klocka!", "3"),
                scene("help", "Du hjälpte hela servern.", "999"),
                scene("project", "En klocka tog form.", "1", "2"),
                scene("change", "Du visade samma klocka.", "2"),
                scene("quote", "Klockrent!", "3")
            ]}

        selected = edit(candidates, originals, ask)
        self.assertEqual([s["story"] for s in selected], ["Klockrent!"])

    def test_long_year_keeps_twelve_reviewed_stories_and_rechecks_rewrites(self):
        posts={i:f"Jag visade mitt bygge nummer {i}." for i in range(1,17)}
        candidates=[dict(title=f"Bygge {i}",sources=[dict(id=str(i),date=f"2026-05-{i:02}",channel="42")])
                    for i in posts]
        def ask(prompt,data):
            if prompt==EDITOR:
                return {"scenes":[dict(title=c["title"],story="Ett nytt bygge tog form.",kind="project",
                                       ids=[c["posts"][0]["id"]]) for c in data]}
            if prompt==SCRIPT_REVIEW:
                reviewed=[dict(s,title="Granskat "+s["title"],support=s["originals"][0]["text"]) for s in data]
                reviewed[0]["story"]="Här kommer ett halvfärdigt ord…"
                reviewed[1]["support"]="En mening som saknas i originalet."
                reviewed[2]["story"]="Du visade det för din tjej."
                return {"approved":reviewed}
            self.assertEqual(prompt,FACT_CHECK)
            self.assertTrue(all(s["title"].startswith("Granskat ") for s in data))
            self.assertEqual({s["index"] for s in data},set(range(3,16)))
            return {"verified":[s["index"] for s in data]}
        selected=edit(candidates,posts,ask)
        self.assertEqual(12,len(selected))
        self.assertTrue(all(int(s["sources"][0]["id"])>=4 for s in selected))
