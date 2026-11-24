import unittest
from unittest.mock import MagicMock, patch

from flask import Flask
from werkzeug.exceptions import ServiceUnavailable

import films


class FilmAccessTest(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        self.run_id = "ef93c614-844b-4f91-a7fa-5f5a8521db96"
        self.digest = "a" * 64
        self.run = {"done": True, "channels": ["A"], "stats": {"name": "Medlem"}}
        self.channels = {"A": "verkstaden"}
        self.results = {}
        self.uid = "owner"
        films.install(app, lambda: {"user": {"id": self.uid}}, lambda _: self.channels)
        self.client = app.test_client()
        self.key = self.run_id + "/" + self.digest
        self.results[("owner", films.STORY, self.run_id)] = self.run
        self.results[("owner", films.FILM, self.key)] = {
            "url": "https://example.private.blob.vercel-storage.com/film.mp4", "channels": ["A"]}
        patcher = patch("films.history.connect", return_value=MagicMock())
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = patch("films.history.get_generated", side_effect=lambda db, *key: self.results.get(key))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_other_member_cannot_read_or_write_owners_film(self):
        self.uid = "another-member"
        self.assertEqual(404, self.client.get("/filmer/" + self.key).status_code)
        self.assertEqual(404, self.client.post("/data/films/" + self.key + "/upload",
                                              data={"size": 1024}).status_code)

    def test_lost_channel_permission_blocks_replay_and_upload(self):
        self.channels.clear()
        self.assertEqual(404, self.client.get("/filmer/" + self.key).status_code)
        self.assertEqual(404, self.client.post("/data/films/" + self.key + "/confirm",
                                              data={"size": 1024}).status_code)

    def test_retry_completed_upload_without_sending_bytes_again(self):
        res = self.client.post("/data/films/" + self.key + "/upload", data={"size":1024})
        self.assertEqual({"saved":True}, res.json)

    def test_invalid_format_cannot_be_saved(self):
        res = self.client.post("/data/films/" + self.key + "/confirm",
                               data={"size": 1024, "format": "unknown"})
        self.assertEqual(400, res.status_code)

    def test_stats_page_only_sends_profile_and_aggregates(self):
        import app as web
        self.run.update(stories=[{"kind":"project","title":"secret-story","story":"secret-body","sources":[]}])
        self.run["stats"].update(messages=7, days=2, conversation={"quote":"secret-conversation"},
                                 activity={"longestStreak":2, "replies":3, "highlights":"secret-highlight"},
                                 months={"2026-03":7,"secret-month":1})
        db = MagicMock()
        db.execute.return_value.fetchone.return_value = (self.run, 1)
        with patch.object(web,"authenticated_member",return_value={"user":{"id":"1"}}), \
             patch.object(web,"readable_channels",return_value={"A":"secret-channel"}), \
             patch.object(web.history,"connect") as connect:
            connect.return_value.__enter__.return_value = db
            client = web.app.test_client()
            url = "/filmer/underlag/" + self.run_id
            stats = client.get(url+"?format=stats")
            self.assertEqual(200, stats.status_code)
            self.assertNotIn(b"secret-", stats.data)
            self.assertIn(b'"messages": 7', stats.data)
            self.assertIn(b'"replies": 3', stats.data)
            editorial = client.get(url)
            self.assertIn(b"secret-story", editorial.data)
            self.assertEqual(400, client.get(url+"?format=unknown").status_code)

    def test_wrong_store_cannot_issue_upload_ticket(self):
        response = MagicMock(ok=True, status_code=200)
        response.json.return_value = {"url":"https://demo.public.blob.vercel-storage.com/wrapped/config/private-store.txt"}
        with patch("films.requests.get", return_value=response), self.assertRaises(ServiceUnavailable):
            films.require_private_store("public-test")
