# AI-Connector Run Prototype

This prototype includes a small Python API that runs a feedback loop between two mock agents.

## Run it

The project uses two local servers: one serves the website files, and the
other runs the FastAPI backend.

### 1. Install the Python dependencies

Open PowerShell in this folder:

    python -m pip install -r requirements.txt

### 2. Start the FastAPI backend

In the same PowerShell window, run:

    uvicorn server:app --app-dir python --reload

Keep this window open. The backend runs at:

    http://localhost:8000

The backend provides these routes:

- http://localhost:8000/api/health - checks whether the backend is running
- http://localhost:8000/docs - opens the FastAPI interactive documentation
- POST http://localhost:8000/api/run - runs the two-agent conversation

The backend does not currently define a GET root route, so visiting
http://localhost:8000/ will correctly return 404 Not Found. This does not
mean that Uvicorn failed.

### 3. Serve the website

Open a second PowerShell window and run:

    python -m http.server 5500

Keep this window open too. Open the website at:

    http://localhost:5500/html/index.html

Enter an initial prompt and click Start Run. The website sends the prompt to
the FastAPI backend at http://localhost:8000/api/run.

### 4. Stop the servers

Press Ctrl+C in each PowerShell window when you are finished.

## Environment variables and API keys

The .env file is ignored by Git and must not be committed. Never place a
real API key in html/, javascript/, or any other browser-side file.
If a key has been exposed or committed, revoke it and create a replacement.

The current mock-agent server does not read values from .env yet. This file
will only be needed after the agents are connected to an external AI provider.

## Structure

- html/ - HTML pages for the application
- css/styles.css - responsive visual styling
- javascript/ - browser JavaScript modules and Firebase setup
- python/server.py - FastAPI endpoint that runs the feedback loop
- python/agents.py - mock Model A and Model B implementations
- json/prompts.json - prompt data
- requirements.txt - Python dependencies
- assets/ - reserved for future icons or imagery
- wireframes/ - wireframes for the website
