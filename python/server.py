"""Small FastAPI server for the two-agent conversation prototype."""

import json
import time
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, SecretStr, field_validator
from starlette.responses import JSONResponse, StreamingResponse

from agents import DEFAULT_MODE, DEFAULT_MODEL, AgentA, AgentB, ModelName, RunMode


app = FastAPI(title="Two-Agent Prototype")
RUN_ERROR_MESSAGE = (
    "The AI request failed. Check your provider's API key, model access, "
    "and usage limits, or use Change API key to replace the saved key."
)
PROVIDER_SETUP_MESSAGE = (
    "The selected AI provider is not installed on the server. "
    "Install requirements.txt and restart the server."
)
# TURN_DELAY_SECONDS = 3
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConversationMessage(BaseModel):
    """The text and speaker labels needed to resume a conversation."""
    name: str
    role: str
    text: str


class RunRequest(BaseModel):
    prompt: str = Field(min_length=1)
    turns: int = Field(default=6, ge=1, le=20)
    mode: RunMode | None = DEFAULT_MODE
    history: list[ConversationMessage] = Field(default_factory=list)
    model_a_name: str | None = Field(default=None, max_length=50)
    model_b_name: str | None = Field(default=None, max_length=50)
    model_a_role: str | None = Field(default=None, max_length=50)
    model_b_role: str | None = Field(default=None, max_length=50)
    model_a_model: ModelName = DEFAULT_MODEL
    model_b_model: ModelName = DEFAULT_MODEL
    model_a_api_key: SecretStr = Field(min_length=1, max_length=4096, repr=False, exclude=True)
    model_b_api_key: SecretStr = Field(min_length=1, max_length=4096, repr=False, exclude=True)

    @field_validator("model_a_api_key", "model_b_api_key", mode="before")
    @classmethod
    def trim_api_key(cls, value):
        return value.strip() if isinstance(value, str) else value


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request, error: RequestValidationError):
    # FastAPI's default validation response can include submitted input. Keep
    # keys out of responses, including when a different field is invalid.
    details = [
        {"loc": item["loc"], "msg": item["msg"], "type": item["type"]}
        for item in error.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": details})


class Message(ConversationMessage):
    time: str


class RunResponse(BaseModel):
    prompt: str
    messages: list[Message]


def _conversation_context(history: list[ConversationMessage], name: str, role: str) -> str:
    """Keep the transcript in user context, not in the initial system prompt."""
    if not history:
        return ""

    transcript = json.dumps(
        [message.model_dump() for message in history], ensure_ascii=False
    )
    return (
        "Conversation so far, oldest to newest (JSON):\n"
        f"{transcript}\n\n"
        f"Continue the conversation as {name} ({role}). "
        "Take the whole conversation and any human feedback into account, "
        "and respond to the latest message. Write only your next reply, "
        "not a replay of the transcript."
    )


def _generate_events(request: RunRequest):
    """Announce each responding agent, then yield its completed message."""
    agents = [
        AgentA(
            request.model_a_name, request.model_a_role,
            model=request.model_a_model,
            api_key=request.model_a_api_key.get_secret_value(),
            mode=request.mode,
        ),
        AgentB(
            request.model_b_name, request.model_b_role,
            model=request.model_b_model,
            api_key=request.model_b_api_key.get_secret_value(),
            mode=request.mode,
        ),
    ]
    # Every request carries its own history, so separate users do not share
    # conversation state and a continuation can survive a server restart.
    history = list(request.history)

    for turn in range(request.turns):
        # if turn > 0:
        #     time.sleep(TURN_DELAY_SECONDS)

        agent = agents[turn % len(agents)]
        yield {"type": "responding", "name": agent.name, "turn": turn + 1}
        context = _conversation_context(history, agent.name, agent.role)
        response = agent.respond(request.prompt, context)
        message = Message(
            name=agent.name,
            role=agent.role,
            text=response,
            time=datetime.now(timezone.utc).isoformat(),
        )
        history.append(ConversationMessage(
            name=message.name, role=message.role, text=message.text
        ))
        yield message


def _generate_messages(request: RunRequest):
    """Return only completed messages for the non-streaming endpoint."""
    for event in _generate_events(request):
        if isinstance(event, Message):
            yield event


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/run", response_model=RunResponse)
def run_conversation(request: RunRequest) -> RunResponse:
    try:
        return RunResponse(
            prompt=request.prompt,
            messages=list(_generate_messages(request)),
        )
    except ImportError:
        raise HTTPException(status_code=503, detail=PROVIDER_SETUP_MESSAGE) from None
    except Exception:
        raise HTTPException(status_code=502, detail=RUN_ERROR_MESSAGE) from None


@app.post("/api/run/stream")
def stream_conversation(request: RunRequest) -> StreamingResponse:
    """Stream responding-agent updates and completed messages as JSON lines."""
    def message_stream():
        try:
            for event in _generate_events(request):
                payload = event.model_dump() if isinstance(event, Message) else event
                yield json.dumps(payload) + "\n"
        except ImportError:
            yield json.dumps({"type": "error", "message": PROVIDER_SETUP_MESSAGE}) + "\n"
        except Exception:
            # Provider errors may contain credentials; return a fixed message.
            yield json.dumps({"type": "error", "message": RUN_ERROR_MESSAGE}) + "\n"

    return StreamingResponse(
        message_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
