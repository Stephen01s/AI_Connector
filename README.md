# Vellum Run Prototype

This prototype includes a small Python API that runs a feedback loop between
two mock agents.

## Run it

From this folder, install the dependencies and start the server:

    python -m pip install -r requirements.txt
    uvicorn server:app --reload

Then open index.html in a browser. Enter an initial prompt and click Start
Run. The browser calls POST /api/run, and the Python server alternates between
Model A and Model B.

## Structure

- index.html - three-screen app shell and semantic markup
- styles.css - responsive visual styling
- script.js - screen navigation, API requests, message rendering, local JSON export, and demo actions
- server.py - FastAPI endpoint that runs the feedback loop
- agents.py - mock Model A and Model B implementations
- requirements.txt - Python dependencies
- assets/ - reserved for future icons or imagery
