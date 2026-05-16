# Penny.io

AI financial advisor for college students. Chat with Penny about credit card debt, budgeting, and credit scores. Upload a statement and get a spending breakdown.

1. put your openai api key in the .env file in the root folder

```
OPENAI_API_KEY=sk-...
```

2. install and start the backend (requires python 3.13)

```bash
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd backend
python3.13 -m uvicorn main:app --reload --port 8000
```

3. open a new terminal and start the frontend

```bash
cd frontend
npm install
npm run dev
```

4. go to http://localhost:5173
