"""Small FastAPI server for the two-agent conversation prototype."""

import json
import time
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, SecretStr, field_validator
from starlette.responses import JSONResponse, StreamingResponse

from agents import DEFAULT_MODEL, AgentA, AgentB, ModelName


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


class RunRequest(BaseModel):
    prompt: str = Field(min_length=1)
    turns: int = Field(default=6, ge=1, le=20)
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


class Message(BaseModel):
    name: str
    role: str
    text: str
    time: str


class RunResponse(BaseModel):
    prompt: str
    messages: list[Message]


def _generate_events(request: RunRequest):
    """Announce each responding agent, then yield its completed message."""
    agents = [
        AgentA(
            request.model_a_name, request.model_a_role,
            model=request.model_a_model,
            api_key=request.model_a_api_key.get_secret_value(),
        ),
        AgentB(
            request.model_b_name, request.model_b_role,
            model=request.model_b_model,
            api_key=request.model_b_api_key.get_secret_value(),
        ),
    ]
    previous_message = ""

    for turn in range(request.turns):
        # if turn > 0:
        #     time.sleep(TURN_DELAY_SECONDS)

        agent = agents[turn % len(agents)]
        yield {"type": "responding", "name": agent.name, "turn": turn + 1}
        response = agent.respond(request.prompt, previous_message)
        message = Message(
            name=agent.name,
            role=agent.role,
            text=response,
            time=datetime.now().strftime("%I:%M %p").lstrip("0"),
        )
        yield message
        previous_message = response


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
