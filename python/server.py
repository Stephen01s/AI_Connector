"""Small FastAPI server for the two-agent conversation prototype."""

from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agents import AgentA, AgentB


app = FastAPI(title="Two-Agent Prototype")
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


class Message(BaseModel):
    name: str
    role: str
    text: str
    time: str


class RunResponse(BaseModel):
    prompt: str
    messages: list[Message]


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/run", response_model=RunResponse)
def run_conversation(request: RunRequest) -> RunResponse:
    agents = [AgentA(), AgentB()]
    messages: list[Message] = []
    previous_message = ""

    for turn in range(request.turns):
        agent = agents[turn % len(agents)]
        response = agent.respond(request.prompt, previous_message)
        messages.append(
            Message(
                name=agent.name,
                role=agent.role,
                text=response,
                time=datetime.now().strftime("%I:%M %p").lstrip("0"),
            )
        )
        previous_message = response

    return RunResponse(prompt=request.prompt, messages=messages)
