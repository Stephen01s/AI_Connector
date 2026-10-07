"""Gemini-backed agents for the two-agent conversation prototype."""

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver


# Load the AI_Connector/.env file regardless of the directory used to start
# Uvicorn.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# LangChain's Google integration accepts GOOGLE_API_KEY. The project currently
# stores the key as GEMINI_API_KEY, so support that existing name as well.
if not os.getenv("GOOGLE_API_KEY") and os.getenv("GEMINI_API_KEY"):
    os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]


DEFAULT_MODEL = "google_genai:gemini-flash-lite-latest"


def _get_text_response(result: dict) -> str:
    """Extract text from the final LangChain agent message."""
    content = result["messages"][-1].content

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        return "\n".join(
            block.get("text", "") if isinstance(block, dict)
            else getattr(block, "text", "")
            for block in content
        )

    return str(content)


def _build_agent(system_prompt: str, role: str, model: str = DEFAULT_MODEL):
    """Create one Gemini agent using the prompt entered on the website."""
    role_instructions = (
        f"\n\nYou are the {role} in a conversation between two agents. "
        "Respond directly to the other agent and contribute useful progress."
    )

    return create_agent(
        model=model,
        tools=[],
        checkpointer=InMemorySaver(),
        system_prompt=system_prompt + role_instructions,
    )


async def _get_response(
    system_prompt: str,
    previous_message: str,
    role: str,
    model: str = DEFAULT_MODEL,
) -> str:
    """Generate one response from Gemini."""
    agent = _build_agent(system_prompt, role, model)
    user_message = previous_message or "Begin the conversation using your instructions."
    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": user_message}]},
        {"configurable": {"thread_id": f"{role.lower()}-conversation"}},
    )
    return _get_text_response(result)


def get_response(
    system_prompt: str,
    previous_message: str,
    role: str,
    model: str = DEFAULT_MODEL,
) -> str:
    """Synchronous wrapper used by the FastAPI endpoint."""
    return asyncio.run(
        _get_response(system_prompt, previous_message, role, model)
    )


class AgentA:
    name = "Model A"
    role = "Proposer"

    def respond(self, prompt: str, previous_message: str) -> str:
        return get_response(prompt, previous_message, self.role)


class AgentB:
    name = "Model B"
    role = "Critic"

    def respond(self, prompt: str, previous_message: str) -> str:
        return get_response(prompt, previous_message, self.role)
