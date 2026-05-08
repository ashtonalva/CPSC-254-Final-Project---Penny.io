# Penny.io — AI Financial Advisor for College Students

Penny.io is a multi-turn AI financial advisor web app. Chat with Penny about credit cards, debt payoff, and budgeting. Upload a credit card statement (PDF or image) for personalized spending analysis.

## Setup & Running (fresh clone)

### Prerequisites

- Python 3.11–3.13 (Python 3.14 is not yet supported by pydantic-core; use `python3.13` if your system default is newer)
- Node 20+
- An OpenAI API key

### 1. Clone and configure

```bash
git clone <repo-url>
cd penny.io
cp .env.example .env
# Edit .env and add your OpenAI API key:
# OPENAI_API_KEY=sk-...
```

### 2. Install backend dependencies

```bash
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

> **Note:** If `python3.13` is not found, try `python3.12` or `python3.11`. The venv must use Python 3.11–3.13.

### 3. Start the backend

```bash
# If the venv is active (source .venv/bin/activate was run above):
uvicorn backend.main:app --reload --port 8000
```

The backend runs at http://localhost:8000. You can verify it's working at http://localhost:8000/health.

### 4. Install and start the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at http://localhost:5173. Open that URL in your browser.

### 5. (Optional) Run the eval

```bash
# With venv active:
python eval/eval.py
```

This runs 12 labeled test cases against the live backend and prints the `advice_quality_score`. Results are saved to `eval/eval_results.json`.

## Project structure

```
penny.io/
├── README.md              # this file
├── .env.example           # template — copy to .env and fill in key
├── requirements.txt       # pinned Python dependencies
├── REPORT.md              # 4-section project report
├── backend/
│   └── main.py            # FastAPI app: /chat, /upload, /health
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # chat UI
│   │   ├── App.css        # styles
│   │   └── main.jsx       # entry point
│   ├── index.html
│   └── package.json
└── eval/
    ├── eval.py            # eval script
    ├── test_cases.json    # 12 labeled test cases
    └── eval_results.json  # generated on eval run
```

## Features

- **Multi-turn conversation** — Penny remembers everything you said earlier in the chat
- **Credit card statement upload** — upload a PDF or image; Penny analyzes spending categories
- **Function calling** — exact math for payoff timelines, credit utilization, and minimum payment costs (no guessing)
- **New Chat** button to reset the conversation

## Troubleshooting

- **Backend won't start:** make sure `OPENAI_API_KEY` is set in `.env` and `pip install -r requirements.txt` completed without errors.
- **CORS errors in browser:** confirm the backend is running on port 8000 and the frontend on port 5173.
- **Upload fails:** GPT-4o supports PDF and common image formats (JPEG, PNG). Files over ~10MB may time out.
