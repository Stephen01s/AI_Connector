"""Observer tests with model clients mocked; no paid calls or database writes."""

import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
import agents
import server


class AnalysisTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)
        self.payload = {
            "prompt": "Plan a community garden.",
            "mode": "Debate",
            "messages": [
                {"name": "Planner", "role": "Planner", "text": "Consider native plants."},
                {"name": "Human", "role": "Moderator", "text": "Focus on the budget."},
                {"name": "Critic", "role": "Critic", "text": "Compare initial costs."},
            ],
            "model_a_model": "openai:gpt-4o",
            "model_a_api_key": "  observer-test-key  ",
        }

    def test_analysis_reuses_only_model_a_credentials_without_running_participants(self):
        with patch("server.ObserverAgent") as observer, patch(
            "server.AgentA.respond"
        ) as agent_a, patch("server.AgentB.respond") as agent_b:
            observer.return_value.analyze.return_value = "A neutral report."
            response = self.client.post("/api/analyze", json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["text"], "A neutral report.")
        self.assertEqual(response.headers["cache-control"], "no-store")
        observer.assert_called_once_with(model="openai:gpt-4o", api_key="observer-test-key")
        observer.return_value.analyze.assert_called_once_with(
            self.payload["prompt"], self.payload["messages"], "Debate", True
        )
        agent_a.assert_not_called()
        agent_b.assert_not_called()
        self.assertNotIn("observer-test-key", response.text)

    def test_observer_has_its_own_system_prompt_and_numbered_transcript(self):
        graph = SimpleNamespace(ainvoke=AsyncMock(return_value={
            "messages": [SimpleNamespace(content="An evidence-based observation.")]
        }))
        with patch("agents.init_chat_model") as initialize, patch(
            "agents.create_agent", return_value=graph
        ) as create:
            response = self.client.post("/api/analyze", json={
                **self.payload, "prompt_is_complete": False
            })
        self.assertEqual(response.status_code, 200)
        initialize.assert_called_once_with("openai:gpt-4o", api_key="observer-test-key")
        system_prompt = create.call_args.kwargs["system_prompt"]
        self.assertEqual(system_prompt, agents.OBSERVER_SYSTEM_PROMPT)
        self.assertNotIn("Your role is the highest priority", system_prompt)
        self.assertNotIn("100 words", system_prompt)
        self.assertNotIn(self.payload["prompt"], system_prompt)
        self.assertNotIn("observer-test-key", system_prompt)
        context = json.loads(graph.ainvoke.call_args.args[0]["messages"][0]["content"])
        self.assertEqual(context["original_prompt"], self.payload["prompt"])
        self.assertFalse(context["original_prompt_is_complete"])
        self.assertEqual(context["conversation_mode"], "Debate")
        self.assertEqual([message["message_number"] for message in context["messages"]], [1, 2, 3])
        self.assertEqual(context["messages"][1]["text"], "Focus on the budget.")
        self.assertEqual(create.call_args.kwargs["tools"], [])

    def test_request_keys_are_excluded_from_serialization_and_repr(self):
        request = server.AnalysisRequest(**self.payload)
        self.assertNotIn("model_a_api_key", request.model_dump())
        self.assertNotIn("observer-test-key", repr(request))

    def test_observer_checks_sycophancy_and_explains_ethics_instead_of_summarizing(self):
        prompt = agents.OBSERVER_SYSTEM_PROMPT
        self.assertNotIn("Summary:", prompt)
        self.assertIn("Sycophancy and unexpected information:", prompt)
        self.assertIn(
            "Check for sychophancy and any unexpected information that comes out",
            prompt,
        )
        self.assertIn("Distinguish this from reasoned agreement", prompt)
        self.assertIn("what is unverified", prompt)
        self.assertIn("Human guidance: ethical implications and prompt-defined goals", prompt)
        self.assertIn("In plain language", prompt)
        self.assertIn("do not invent or claim to know them", prompt)
        self.assertIn("one concrete human verification or oversight step", prompt)
        self.assertIn("reflection question", prompt)
        self.assertIn("ethical certification", prompt)

    def test_real_langchain_agent_runs_with_an_offline_model(self):
        fake_model = FakeListChatModel(responses=["An offline observation."])
        with patch("agents.init_chat_model", return_value=fake_model):
            response = self.client.post("/api/analyze", json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["text"], "An offline observation.")

    def test_invalid_analysis_inputs_are_rejected_without_echoing_keys(self):
        for changes in (
            {"messages": []}, {"prompt": ""}, {"model_a_api_key": "   "},
            {"model_a_model": "unsupported:model"},
            {"messages": [{"name": "Human", "role": "Moderator"}]},
        ):
            with self.subTest(changes=changes), patch("server.ObserverAgent") as observer:
                response = self.client.post("/api/analyze", json={**self.payload, **changes})
                self.assertEqual(response.status_code, 422)
                self.assertNotIn("observer-test-key", response.text)
                self.assertNotIn('"input"', response.text)
                observer.assert_not_called()

    def test_provider_failures_are_redacted(self):
        for exception, status_code, message in (
            (RuntimeError("observer-test-key"), 502, server.ANALYSIS_ERROR_MESSAGE),
            (ImportError("observer-test-key"), 503, server.PROVIDER_SETUP_MESSAGE),
        ):
            with self.subTest(status=status_code), patch("server.ObserverAgent") as observer:
                observer.return_value.analyze.side_effect = exception
                response = self.client.post("/api/analyze", json=self.payload)
            self.assertEqual(response.status_code, status_code)
            self.assertEqual(response.json()["detail"], message)
            self.assertNotIn("observer-test-key", response.text)


if __name__ == "__main__":
    unittest.main()
