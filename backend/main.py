import base64
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Penny.io API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SYSTEM_PROMPT = """You are Penny, a friendly and knowledgeable AI financial advisor for college students and young adults (18–25). Your tone is warm, encouraging, and jargon-free.

Your job is to:
- Help users understand credit cards, debt, budgeting, and credit scores
- Analyze credit card statements when uploaded
- Give concrete, personalized advice based on what the user has shared
- Use the calculation tools available to you for exact math — never estimate interest or payoff timelines in free text

Rules:
- ALWAYS call the appropriate tool when performing financial calculations (payoff timelines, interest costs, credit utilization). Do not do this math inline.
- Reference specific details the user has shared earlier in the conversation. Never ask for information the user already provided.
- When a user uploads a statement, reference specific spending categories from it in your advice.
- Keep responses concise (3–5 paragraphs max). Use **bold** for key numbers and terms. Use bullet points for lists of tips.
- If asked something outside personal finance, gently redirect to financial topics.
- Never guarantee investment returns or make promises about financial outcomes."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "calculate_payoff_timeline",
            "description": "Calculate how many months it will take to pay off a credit card balance and the total interest paid, given a fixed monthly payment.",
            "parameters": {
                "type": "object",
                "properties": {
                    "balance": {"type": "number", "description": "Current balance owed in dollars"},
                    "apr": {"type": "number", "description": "Annual percentage rate as a decimal (e.g. 0.22 for 22%)"},
                    "monthly_payment": {"type": "number", "description": "Fixed monthly payment amount in dollars"}
                },
                "required": ["balance", "apr", "monthly_payment"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_credit_utilization",
            "description": "Calculate credit utilization ratio and advise whether it is in a healthy range.",
            "parameters": {
                "type": "object",
                "properties": {
                    "balance": {"type": "number", "description": "Current balance on the card in dollars"},
                    "credit_limit": {"type": "number", "description": "Total credit limit on the card in dollars"}
                },
                "required": ["balance", "credit_limit"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_minimum_payment_cost",
            "description": "Show the true cost of only making minimum payments on a credit card.",
            "parameters": {
                "type": "object",
                "properties": {
                    "balance": {"type": "number", "description": "Current balance in dollars"},
                    "apr": {"type": "number", "description": "Annual percentage rate as a decimal"},
                    "minimum_payment_rate": {"type": "number", "description": "Minimum payment as a fraction of balance (default 0.02)", "default": 0.02},
                    "minimum_payment_floor": {"type": "number", "description": "Minimum dollar floor (default 25)", "default": 25}
                },
                "required": ["balance", "apr"]
            }
        }
    }
]

DEMO_STATEMENT = """
CREDIT CARD STATEMENT — DEMO ACCOUNT (April 2026)

TRANSACTIONS:
04/01  Rent payment (Zelle)            $850.00
04/02  Chipotle                         $13.50
04/03  Spotify Premium                   $9.99
04/04  Amazon — textbook                $47.23
04/05  Uber Eats                        $28.40
04/07  Shell Gas Station                $55.00
04/08  Netflix                          $15.49
04/09  Target — household               $83.21
04/11  Chipotle                         $11.75
04/12  Starbucks                         $6.45
04/13  Uber Eats                        $34.20
04/14  Disney+                          $13.99
04/15  Amazon — shoes                   $79.99
04/16  Shell Gas Station                $48.00
04/18  Chipotle                         $12.25
04/19  Apple iCloud                      $2.99
04/20  Uber Eats                        $22.15
04/21  Whole Foods                      $67.40
04/22  Hulu                             $17.99
04/23  Amazon — random purchase        $156.00
04/24  Starbucks                         $7.80
04/25  Shell Gas Station                $52.00
04/26  Uber Eats                        $19.50
04/27  Chipotle                         $14.25
04/28  Spotify Premium                   $9.99

SPENDING SUMMARY:
  Dining & Restaurants (Chipotle, UberEats, Starbucks): $170.25
  Streaming Services (Spotify, Netflix, Disney+, Hulu):  $67.45
  Gas & Transportation:                                 $155.00
  Shopping (Amazon, Target):                            $366.43
  Groceries (Whole Foods):                               $67.40
  Rent:                                                 $850.00
  Other (iCloud):                                         $2.99

TOTAL CHARGES:  $1,679.52
ACCOUNT SUMMARY:
  Current Balance:  $1,247.83
  Credit Limit:     $3,000.00
  APR:              24.99%
  Minimum Payment Due: $35.00
"""


def calculate_payoff_timeline(balance: float, apr: float, monthly_payment: float) -> dict:
    if monthly_payment <= 0:
        return {"error": "Monthly payment must be positive."}
    monthly_rate = apr / 12
    if monthly_rate == 0:
        months = round(balance / monthly_payment)
        return {
            "months": months, "years": round(months / 12, 1),
            "total_paid": round(balance, 2), "total_interest": 0.0,
            "balance_history": [{"month": 0, "balance": round(balance, 2)}, {"month": months, "balance": 0}]
        }
    min_interest = balance * monthly_rate
    if monthly_payment <= min_interest:
        return {"error": f"Monthly payment of ${monthly_payment:.2f} is too low to cover monthly interest of ${min_interest:.2f}."}

    # First pass: get total months
    months = 0
    remaining = balance
    while remaining > 0 and months < 1200:
        remaining = remaining + remaining * monthly_rate - monthly_payment
        months += 1
        if remaining < 0:
            remaining = 0

    # Second pass: collect balance history (~12 data points) and total interest
    sample_every = max(1, months // 11)
    balance_history = [{"month": 0, "balance": round(balance, 2)}]
    remaining = balance
    total_interest = 0.0
    for m in range(1, months + 1):
        interest = remaining * monthly_rate
        total_interest += interest
        remaining = remaining + interest - monthly_payment
        if remaining < 0:
            remaining = 0
        if m % sample_every == 0 or m == months:
            balance_history.append({"month": m, "balance": round(remaining, 2)})

    return {
        "months": months,
        "years": round(months / 12, 1),
        "total_paid": round(balance + total_interest, 2),
        "total_interest": round(total_interest, 2),
        "balance_history": balance_history,
    }


def calculate_credit_utilization(balance: float, credit_limit: float) -> dict:
    if credit_limit <= 0:
        return {"error": "Credit limit must be positive."}
    utilization = balance / credit_limit
    pct = round(utilization * 100, 1)
    if utilization < 0.1:
        status, advice = "excellent", "Under 10% — this is ideal for your credit score."
    elif utilization < 0.3:
        status, advice = "good", "Under 30% — most experts recommend staying below this."
    elif utilization < 0.5:
        status, advice = "moderate", "30–50% — try to pay down to below 30% for a better score impact."
    else:
        status, advice = "high", "Above 50% — this is likely hurting your credit score significantly."
    return {"utilization_pct": pct, "status": status, "advice": advice, "balance": balance, "credit_limit": credit_limit}


def calculate_minimum_payment_cost(balance: float, apr: float, minimum_payment_rate: float = 0.02, minimum_payment_floor: float = 25) -> dict:
    monthly_rate = apr / 12
    months = 0
    remaining = balance
    total_interest = 0.0
    while remaining > 0 and months < 3600:
        payment = max(remaining * minimum_payment_rate, minimum_payment_floor)
        if payment > remaining:
            payment = remaining
        interest = remaining * monthly_rate
        total_interest += interest
        remaining = remaining + interest - payment
        months += 1
        if remaining < 0.01:
            remaining = 0
    return {
        "months": months,
        "years": round(months / 12, 1),
        "total_interest": round(total_interest, 2),
        "total_paid": round(balance + total_interest, 2),
    }


TOOL_HANDLERS = {
    "calculate_payoff_timeline": calculate_payoff_timeline,
    "calculate_credit_utilization": calculate_credit_utilization,
    "calculate_minimum_payment_cost": calculate_minimum_payment_cost,
}


class ChatRequest(BaseModel):
    messages: list[dict]


def run_tool_call(tool_name: str, args: dict) -> str:
    handler = TOOL_HANDLERS.get(tool_name)
    if not handler:
        return json.dumps({"error": f"Unknown tool: {tool_name}"})
    return json.dumps(handler(**args))


def chat_with_tools(messages: list[dict]) -> tuple[str, list[str]]:
    full_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages
    tools_used: list[str] = []
    while True:
        response = client.chat.completions.create(
            model="gpt-4o", messages=full_messages, tools=TOOLS, tool_choice="auto",
        )
        msg = response.choices[0].message
        if msg.tool_calls:
            full_messages.append(msg)
            for tc in msg.tool_calls:
                tools_used.append(tc.function.name)
                args = json.loads(tc.function.arguments)
                full_messages.append({"role": "tool", "tool_call_id": tc.id, "content": run_tool_call(tc.function.name, args)})
        else:
            return msg.content, tools_used


async def generate_chat_stream(messages: list[dict]):
    full_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages
    tools_used: list[str] = []
    tool_results_data: dict = {}

    # Phase 1: run tool calls synchronously
    while True:
        response = client.chat.completions.create(
            model="gpt-4o", messages=full_messages, tools=TOOLS, tool_choice="auto",
        )
        msg = response.choices[0].message
        if msg.tool_calls:
            full_messages.append(msg)
            for tc in msg.tool_calls:
                tool_name = tc.function.name
                tools_used.append(tool_name)
                yield f"data: {json.dumps({'type': 'tool_call', 'name': tool_name})}\n\n"
                args = json.loads(tc.function.arguments)
                result_str = run_tool_call(tool_name, args)
                tool_results_data[tool_name] = json.loads(result_str)
                full_messages.append({"role": "tool", "tool_call_id": tc.id, "content": result_str})
        else:
            break

    # Phase 2: stream the text response
    stream = client.chat.completions.create(
        model="gpt-4o", messages=full_messages, stream=True,
    )
    for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            yield f"data: {json.dumps({'type': 'token', 'content': chunk.choices[0].delta.content})}\n\n"

    # Phase 3: done event with metadata
    yield f"data: {json.dumps({'type': 'done', 'tools_used': tools_used, 'tool_results': tool_results_data})}\n\n"


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    return StreamingResponse(
        generate_chat_stream(request.messages),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        reply, tools_used = chat_with_tools(request.messages)
        return {"reply": reply, "tools_used": tools_used}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/demo")
async def demo_analysis():
    try:
        messages = [{
            "role": "user",
            "content": f"I've uploaded my credit card statement. Here's the data:\n\n{DEMO_STATEMENT}\n\nPlease analyze it: identify my top spending categories, flag any concerning patterns, and give me 2-3 specific actionable tips to improve my spending habits."
        }]
        reply, tools_used = chat_with_tools(messages)
        demo_user_msg = {"role": "user", "content": "[Demo statement loaded] Please analyze my April spending."}
        return {"reply": reply, "tools_used": tools_used, "user_message": demo_user_msg}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upload")
async def upload_statement(file: UploadFile = File(...), messages: str = Form(default="[]")):
    try:
        file_bytes = await file.read()
        content_type = file.content_type or ""
        b64 = base64.b64encode(file_bytes).decode()
        if "pdf" in content_type or file.filename.lower().endswith(".pdf"):
            file_content = {"type": "image_url", "image_url": {"url": f"data:application/pdf;base64,{b64}"}}
        else:
            if "png" in content_type:
                media_type = "image/png"
            elif "gif" in content_type:
                media_type = "image/gif"
            elif "webp" in content_type:
                media_type = "image/webp"
            else:
                media_type = "image/jpeg"
            file_content = {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}}

        history = json.loads(messages)
        upload_message = {
            "role": "user",
            "content": [
                file_content,
                {"type": "text", "text": "I've uploaded my credit card statement. Please analyze it: identify my top spending categories, flag any unusual charges, and give me 2-3 specific actionable tips to improve my spending habits based on what you see."}
            ]
        }
        full_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + history + [upload_message]
        response = client.chat.completions.create(
            model="gpt-4o", messages=full_messages, tools=TOOLS, tool_choice="auto",
        )
        msg = response.choices[0].message
        tools_used: list[str] = []
        if msg.tool_calls:
            full_messages.append(msg)
            for tc in msg.tool_calls:
                tools_used.append(tc.function.name)
                args = json.loads(tc.function.arguments)
                full_messages.append({"role": "tool", "tool_call_id": tc.id, "content": run_tool_call(tc.function.name, args)})
            final = client.chat.completions.create(model="gpt-4o", messages=full_messages)
            reply = final.choices[0].message.content
        else:
            reply = msg.content

        return {
            "reply": reply,
            "tools_used": tools_used,
            "user_message": {"role": "user", "content": f"[Uploaded statement: {file.filename}] Please analyze my credit card statement."}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok"}
