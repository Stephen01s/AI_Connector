"""Mock agents for the first two-agent conversation prototype."""


class AgentA:
    name = "Model A"
    role = "Proposer"

    def respond(self, prompt: str, previous_message: str) -> str:
        if not previous_message:
            return f"I will start by proposing an approach for: {prompt}"
        return f"Building on Model B's feedback, I suggest this next step: {previous_message}"


class AgentB:
    name = "Model B"
    role = "Critic"

    def respond(self, prompt: str, previous_message: str) -> str:
        if not previous_message:
            return f"I will review the proposal and look for improvements related to: {prompt}"
        return f"I reviewed Model A's suggestion. A useful refinement would be: {previous_message}"
