# AI-Connector Run Prototype

## Team Members

Joanna, Austin, Stephen, Hayden

## Software Description

This prototype includes a small Python API that runs a feedback loop between
two agents using Gemini, OpenAI, or Anthropic. The initial prompt entered on
the website is used as the system prompt for both agents.

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

The frontend continues to call the FastAPI backend on Render using `API_URL`
in `javascript/script.js`. Netlify's static deployment does not start the
Python server.

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

## Structure

- html/ - HTML pages for the application
- css/styles.css - responsive visual styling
- javascript/ - browser JavaScript modules and Firebase setup
- python/server.py - FastAPI endpoint that runs the feedback loop
- javascript/api-keys.js - provider key dialog and session storage
- python/agents.py - Model A and Model B with per-request provider credentials
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
