"""Offline API regression tests; no provider requests or real keys are used."""

import json
from pathlib import Path
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
import server
import agents


class ConversationTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)
        self.payload = {
            "prompt": "Plan a community garden.",
            "turns": 3,
            "model_a_name": "Gardener",
            "model_b_name": "Reviewer",
            "model_a_role": "Planner",
            "model_b_role": "Critic",
            "model_a_api_key": "test-key-a",
            "model_b_api_key": "test-key-b",
        }

    def stream(self, payload):
        with patch("agents.get_response", side_effect=lambda *args: f"Reply {calls.call_count}") as calls:
            response = self.client.post("/api/run/stream", json=payload)
        self.assertEqual(response.status_code, 200)
        return [json.loads(line) for line in response.text.splitlines()], calls

    @staticmethod
    def context_messages(call):
        # The transcript is a JSON value between the introductory line and
        # the responding-agent instruction.
        return json.loads(call.args[1].split("\n", 1)[1].split("\n\n", 1)[0])

    def test_initial_round_and_two_follow_ups(self):
        events, calls = self.stream(self.payload)
        self.assertEqual([event["type"] for event in events[::2]], ["responding"] * 3)
        self.assertEqual([event["name"] for event in events[1::2]],
                         ["Gardener", "Reviewer", "Gardener"])
        self.assertEqual(calls.call_args_list[0].args[1], "")
        self.assertEqual(len(self.context_messages(calls.call_args_list[2])), 2)
        history = [
            {field: event[field] for field in ("name", "role", "text")}
            for event in events[1::2]
        ]

        for feedback in ("Use native plants.", "Now estimate the budget."):
            history.append({"name": "Human", "role": "Moderator", "text": feedback})
            submitted_history = list(history)
            events, calls = self.stream({**self.payload, "history": history})
            self.assertEqual(len(events), 6)
            self.assertEqual([event["turn"] for event in events[::2]], [1, 2, 3])
            for index, call in enumerate(calls.call_args_list):
                self.assertEqual(call.args[0], self.payload["prompt"])
                context = self.context_messages(call)
                self.assertEqual(context[:len(history)], history)
                self.assertEqual(len(context), len(history) + index)
                self.assertIn(feedback, call.args[1])
                self.assertEqual(call.args[4], "test-key-a" if index % 2 == 0 else "test-key-b")
            self.assertEqual(history, submitted_history)
            history.extend(
                {field: event[field] for field in ("name", "role", "text")}
                for event in events[1::2]
            )

    def test_non_streaming_endpoint_uses_history(self):
        history = [{"name": "Human", "role": "Moderator", "text": "Focus on cost."}]
        with patch("agents.get_response", return_value="A cheaper plan.") as respond:
            response = self.client.post("/api/run", json={
                **self.payload, "turns": 1, "history": history
            })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["messages"]), 1)
        self.assertEqual(self.context_messages(respond.call_args), history)

    def test_history_is_isolated_between_requests(self):
        self.stream({**self.payload, "history": [
            {"name": "Human", "role": "Moderator", "text": "Private feedback."}
        ]})
        _, calls = self.stream(self.payload)
        self.assertEqual(calls.call_args_list[0].args[1], "")
        self.assertNotIn("Private feedback.", str(calls.call_args_list))

    def test_invalid_history_does_not_expose_keys(self):
        response = self.client.post("/api/run/stream", json={
            **self.payload, "history": [{"name": "Human", "text": "Missing role"}]
        })
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("test-key", response.text)
        self.assertNotIn("input", response.text)

    def test_provider_errors_do_not_expose_keys(self):
        with patch("agents.get_response", side_effect=RuntimeError("test-key-a")):
            response = self.client.post("/api/run/stream", json=self.payload)
        events = [json.loads(line) for line in response.text.splitlines()]
        self.assertEqual(events[-1], {"type": "error", "message": server.RUN_ERROR_MESSAGE})
        self.assertNotIn("test-key-a", response.text)

    def test_transcript_reaches_langchain_as_user_context(self):
        context = "Earlier replies, followed by the latest human feedback."
        graph = SimpleNamespace(ainvoke=AsyncMock(return_value={
            "messages": [SimpleNamespace(content="Here is the next reply.")]
        }))
        with patch("agents._build_agent", return_value=graph) as build:
            result = agents.get_response(
                self.payload["prompt"], context, "Critic", api_key="test-key-b"
            )
        self.assertEqual(result, "Here is the next reply.")
        self.assertEqual(build.call_args.args[0], self.payload["prompt"])
        self.assertEqual(graph.ainvoke.call_args.args[0], {
            "messages": [{"role": "user", "content": context}]
        })


if __name__ == "__main__":
    unittest.main()
