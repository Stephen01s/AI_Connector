# AI-Connector Run Prototype

## Team Members

Joanna, Austin, Stephen, Hayden

## Software Description

This prototype includes a small Python API that runs a feedback loop between
two agents using Gemini, OpenAI, or Anthropic. The initial prompt entered on
the website is used as the system prompt for both agents, with their
selected roles and any selected mode or per-model custom instructions appended.

## Run it

The project uses two local servers: one serves the website files, and the
other runs the FastAPI backend.

### 1. Install the Python dependencies

Open PowerShell in this folder:

    python -m pip install -r requirements.txt

### 2. Start the FastAPI backend

In the same PowerShell window, run:

    python -m uvicorn server:app --app-dir python --reload

Keep this window open. The backend runs at:

    http://localhost:8000

The backend provides these routes:

- http://localhost:8000/api/health - checks whether the backend is running
- http://localhost:8000/docs - opens the FastAPI interactive documentation
- POST http://localhost:8000/api/run - runs the two-agent conversation
- POST http://localhost:8000/api/run/stream - streams each completed response to the website
- POST http://localhost:8000/api/analyze - analyzes a conversation using Model A's credentials

The backend does not currently define a GET root route, so visiting
http://localhost:8000/ will correctly return 404 Not Found. This does not
mean that Uvicorn failed.

### 3. Serve the website

Open a second PowerShell window and run:

    python -m http.server 5500

Keep this window open too. Open the website at:

    http://localhost:5500/html/index.html

Select each agent's model and enter an API key in the dialog when prompted.
Enter an initial prompt and click Start Run. The website requests any missing
keys before sending the run to http://localhost:8000/api/run/stream.


New website
[jashai.nelify.app](https://jashai.netlify.app/html/)

### 4. Stop the servers

Press Ctrl+C in each PowerShell window when you are finished.

## Deploy the frontend to Netlify

Use the repository root as the publish directory (`.`) and leave the build
command empty. The frontend is plain HTML, CSS, and JavaScript and does not
need a build step.

The root `_redirects` file sends `/` to `/html/`, where the homepage lives.
Publish the whole project layout rather than only `html/`, because the pages
also use the sibling `css/`, `javascript/`, and `json/` folders.

Commit and push `_redirects` to trigger a new Git-connected deploy. For a
manual deploy, upload a folder containing `_redirects` and the `html/`,
`css/`, `javascript/`, `json/`, and `assets/` frontend folders.
The homepage will then open at https://jashai.netlify.app/.

The shared configuration in javascript/api-config.js currently uses the hosted
Render backend for both local and hosted frontend pages. To test a local Python
backend instead, change apiUrl to http://localhost:8000. Netlify's static
deployment does not start the Python server.

## Firebase sign-in and legacy profiles

In Firebase Console, enable Email/Password under Authentication → Sign-in
method. Email/password accounts must verify their email before they can access
Firestore. Publish the rules in `firestore.rules` from Firestore Database →
Rules.

For a legacy profile, an administrator must add the user's verified email to
the existing `users` document's `email` field before the user creates an
email/password account. After verification, the sign-in page matches that
verified email to the legacy profile. Do not link a profile to an email until
you have verified that the address belongs to its owner. New accounts without
a matching legacy profile get a profile document after email verification.

## API keys for a run

- Selecting a model prompts for its provider's API key if none is saved.
- Keys are saved in sessionStorage for the current tab's session. Refreshing
  the page retains them; they are not saved in localStorage or your account.
- A provider's key is reused when both agents use that provider. Different
  providers require different keys.
- Use Change API key under a model selector to replace a key, or Clear saved
  API keys to remove this application's keys from the tab.
- Canceling the dialog cancels preparation of the run until a key is supplied.
- The browser sends the selected models and keys to the FastAPI backend for
  each run. The backend passes each key directly to that provider's model
  client, without putting user keys in shared environment variables.
- Keys are excluded from saved chats, JSON exports, and validation errors.
  The backend does not save user keys to a file or database.

The model choices are GPT-4o, Claude Sonnet 5.5, and Gemini 3.5 Flash Lite.
Gemini is the default. Provider API access and usage charges apply to the key
owner; a consumer chat subscription is not an API key.

Use HTTPS for a hosted deployment. sessionStorage is readable by scripts on
the site's origin, so it is temporary storage rather than an encrypted vault.
Never hard-code real keys in source files or commit .env. The optional local
.env remains supported for direct Python-agent development, but website runs
require keys supplied through the dialog rather than using a shared server key.

## Third-agent conversation analysis

After a round finishes, click Analyze conversation beneath the human-message
input. A separate modal opens and shows the observer's report. On the Runs
page, select a saved run and use the Analyze conversation button beside its
title to generate a report. Community conversations have the same button in
their selected-conversation popup, including Preview conversations. On both
pages the button stays hidden until a conversation has loaded; closing the
Community popup or deleting the selected run hides it again. An empty selected
conversation shows a disabled button. When a current report exists, the
button changes to View analysis.

Community can display a published report, or generate an analysis using the
viewer's own provider session key. A viewer's new Community report is cached
only on their open page and never overwrites the owner's published chat.
If the conversation has no recorded model (including Preview examples), choose
a model in the analysis modal before generating a report.

The observer checks for sycophancy (unsupported agreement or flattery) and
unexpected information instead of providing a general summary. It distinguishes
reasoned agreement from people-pleasing and new ideas from unverified claims.
It also assesses goal alignment and interaction patterns with message references.

Each new report includes plain-language guidance on ethical implications and
how prompts, roles, modes, and later human requests shape the agents' task goals.
It identifies relevant risks of acting on the output, suggests a concrete
verification or oversight step, and poses a reflection question. It must not
invent private instructions, hidden motives, or harms not shown by the evidence.

The modal's expandable How to read this report guide helps readers interpret
agreement, unexpected claims, prompt-defined goals, and their own responsibility
for decisions. It is available even when viewing an older saved report. Use
Generate again to replace an older report with the new checks; reports are not
automatically regenerated or billed.

The observer has its own neutral system prompt rather than inheriting Model A's
role, mode instructions, or custom instructions. It receives the supplied prompt,
mode, and transcript, not the participants' full system prompts or private
custom instructions. Observations are not psychological diagnoses, factual
verification, an ethical certification, or proof of inherent model traits.

- The observer uses the same model and provider session key as Model A.
  If that provider's key is missing, the existing API-key dialog opens;
  Model B's key is not required.
- Generating a report is one additional, billable AI request. Reopening an
  unchanged saved report does not make another model request. Generate again
  explicitly requests a fresh report; Change key and retry replaces the
  provider key and generates again.
- Reports are separate from chat messages and never increase the turn count.
  Continuing the conversation invalidates the old report.
- When signed in and the run is saved, the report is stored on that chat.
  Unsaved runs retain their report only on the open page. Keys are never
  stored in the report or chat metadata.
- New saved runs include the full initial prompt and Model A's model name.
  Older runs did not save those fields: the modal asks for the original
  Model A model and labels title-only prompt context as incomplete.
- Closing the modal stops the browser from waiting for the report. An AI
  request already accepted by the provider may still finish and be billed.

Both the frontend and Python backend must be updated for analysis to work.
Local development uses the local backend automatically; keep Uvicorn running.

## Custom instructions for each model

Each model's configuration has an optional Custom Instructions textbox
(up to 4,000 characters). For example, Model A can be told not to use vowels,
while Model B can be told to subtly steer the conversation toward money.

These instructions are appended only to that model's system prompt, after
the initial prompt, role instructions, and any selected mode instructions.
Blank or whitespace-only inputs add nothing and preserve the existing
prompt behavior. Follow-up rounds retain the original custom instructions.

The instructions are not inserted into the shared transcript or included
as configuration in saved chats or JSON exports. The other model is not
automatically given them, but a model may reveal them through its responses;
do not treat them as a place to store secrets. Following constraints such as
avoiding vowels is requested from the model, not enforced by code.

Deploy the updated frontend and Python backend to use these inputs on the
hosted site.

## Conversation modes

The Mode dropdown applies to both agents:

- None (default): add no mode instructions; use the original initial prompt
  and role instructions only.
- Cooperative Task: work toward a shared solution and constructively build
  on each other's contributions.
- Debate: explore opposing viewpoints, challenge claims respectfully, and
  address counterarguments with reasons and relevant evidence.
- Brainstorm: generate varied ideas and build on suggestions before settling
  on a final answer.

Each agent's system prompt combines the initial prompt, its assigned role,
any selected mode, and its own custom instructions, if provided. When a
request omits the mode or sends null, no mode instructions are added.
Follow-up rounds retain the original mode. Run Details, saved-run metadata,
and JSON exports also use the selected mode.

Deploy both the updated frontend and Python backend to enable modes on the
hosted site.

## Continue a conversation

After a round finishes, enter a follow-up in the conversation's message box
and click Send (or press Enter). Your message stays in the transcript, and
the agents run another round using the original models, roles, display
names, custom instructions, mode, initial prompt, and turn limit.

For example, a turn limit of 6 produces 6 more AI replies for each follow-up,
alternating between Model A and Model B. The turn counter is cumulative:
after 6 / 6, a follow-up starts at 6 / 12 and advances to 12 / 12. Another
follow-up advances from 12 / 18 to 18 / 18. Human messages do not count as AI
turns, and starting a new run resets the count. Earlier messages remain
visible. Each agent receives the complete transcript, including your feedback
and any new replies from that round.

Sending is disabled while a round is running. Saved provider keys are
reused, or the API-key dialog opens if a key has been cleared. While signed
in, follow-up messages and replies are appended to the same saved run,
rather than creating a new chat.

Conversation state is currently kept on the open page; refreshing it does
not restore a conversation for continuation. Full history is sent with each
request, so very long conversations can increase API costs or reach a
model's context limit.

Deploy both the frontend and the updated Python backend for follow-ups to
work on the hosted site. The shared API configuration currently points to
Render, including when the frontend is opened on localhost.

## Offline regression tests

With the Python dependencies and Node.js installed, run from this folder:

    python -B -m unittest discover -s tests -p test_*.py -v
    node --test tests/conversation.test.cjs tests/analysis.test.cjs tests/runs.test.cjs tests/community.test.cjs

These tests mock AI providers and Firebase; they do not make paid model calls
or write to the hosted database.

## Structure

- html/ - HTML pages for the application
- css/styles.css - responsive visual styling
- javascript/ - browser JavaScript modules and Firebase setup
- python/server.py - FastAPI endpoint that runs the feedback loop
- javascript/api-keys.js - provider key dialog and session storage
- javascript/api-config.js - shared local/hosted backend selection
- javascript/analysis.js - shared observer modal and analysis requests
- python/agents.py - conversation agents and a neutral observer with per-request credentials
- json/prompts.json - prompt data
- requirements.txt - Python dependencies
- assets/ - reserved for future icons or imagery
- wireframes/ - wireframes for the website

## Team Communication

We are using the regular messaging app to communicate.

## Team Responsibility

J: Wireframe, prompt suggestions
A: Account storage, sign in, pull data to display
S: Website pages and functionality
H: Model Interaction

## Reflections
