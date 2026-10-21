"""Provider-backed agents for the two-agent conversation prototype."""
"""
TODO: Add a third agent that summarizes the chat and determines 
      if it was close to the original prompt or not
"""
import asyncio
import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.memory import InMemorySaver


# Load the AI_Connector/.env file regardless of the directory used to start
# Uvicorn.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# LangChain's Google integration accepts GOOGLE_API_KEY. The project currently
# stores the key as GEMINI_API_KEY, so support that existing name as well.
if not os.getenv("GOOGLE_API_KEY") and os.getenv("GEMINI_API_KEY"):
    os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]


ModelName = Literal[
    "google_genai:gemini-3.5-flash-lite",
    "openai:gpt-4o",
    "anthropic:claude-sonnet-5-5",
]
DEFAULT_MODEL: ModelName = "google_genai:gemini-3.5-flash-lite"


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


def _build_agent(
    system_prompt: str,
    role: str,
    model: str = DEFAULT_MODEL,
    api_key: str | None = None,
):
    """Build a model with this request's key, without changing shared keys."""
    role_instructions = (
        f"\n\nYou are (the) {role} in a conversation. Use only a maximum of 100 words for each response."
    )

    return create_agent(
        model=init_chat_model(model, **({"api_key": api_key} if api_key else {})),
        tools=[],
        checkpointer=InMemorySaver(),
        system_prompt=system_prompt + role_instructions,
    )


async def _get_response(
    system_prompt: str,
    previous_message: str,
    role: str,
    model: str = DEFAULT_MODEL,
    api_key: str | None = None,
) -> str:
    """Generate one response using the selected model and request's key."""
    agent = _build_agent(system_prompt, role, model, api_key)
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
    api_key: str | None = None,
) -> str:
    """Synchronous wrapper used by the FastAPI endpoint."""
    return asyncio.run(
        _get_response(system_prompt, previous_message, role, model, api_key)
    )


class AgentA:
    default_name = "Model A"
    default_role = "Proposer"

    def __init__(
        self,
        display_name: str | None = None,
        role: str | None = None,
        model: str = DEFAULT_MODEL,
        api_key: str | None = None,
    ):
        self.name = display_name.strip() if display_name else self.default_name
        if not self.name:
            self.name = self.default_name
        self.role = role.strip() if role else self.default_role
        if not self.role or self.role == "Select a role...":
            self.role = self.default_role
        self.model = model
        self._api_key = api_key

    def respond(self, prompt: str, previous_message: str) -> str:
        return get_response(prompt, previous_message, self.role, self.model, self._api_key)


class AgentB:
    default_name = "Model B"
    default_role = "Critic"

    def __init__(
        self,
        display_name: str | None = None,
        role: str | None = None,
        model: str = DEFAULT_MODEL,
        api_key: str | None = None,
    ):
        self.name = display_name.strip() if display_name else self.default_name
        if not self.name:
            self.name = self.default_name
        self.role = role.strip() if role else self.default_role
        if not self.role or self.role == "Select a role...":
            self.role = self.default_role
        self.model = model
        self._api_key = api_key

    def respond(self, prompt: str, previous_message: str) -> str:
        return get_response(prompt, previous_message, self.role, self.model, self._api_key)
