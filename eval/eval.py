#!/usr/bin/env python3
"""
Penny.io eval script.

Metric: advice_quality_score = (# responses that reference ≥1 user-specific detail
    AND include ≥1 concrete number or actionable step) / (# total test responses)

Usage:
    python eval/eval.py

Requires OPENAI_API_KEY in environment (or .env in project root).
"""

import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).parent.parent / ".env")

API_BASE_URL = os.getenv("PENNY_API_URL", "http://localhost:8000")

SYSTEM_PROMPT = """You are Penny, a friendly and knowledgeable AI financial advisor for college students and young adults (18–25). Your tone is warm, encouraging, and jargon-free.

Your job is to:
- Help users understand credit cards, debt, budgeting, and credit scores
- Analyze credit card statements when uploaded
- Give concrete, personalized advice based on what the user has shared
- Use the calculation tools available to you for exact math — never estimate interest or payoff timelines in free text

Rules:
- ALWAYS call the appropriate tool when performing financial calculations (payoff timelines, interest costs, credit utilization). Do not do this math inline.
- Reference specific details the user has shared earlier in the conversation. Never ask for information the user already provided.
- Keep responses concise (3–5 paragraphs max). Use bullet points for lists of tips.
- Never guarantee investment returns or make promises about financial outcomes."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "calculate_payoff_timeline",
            "description": "Calculate how many months it will take to pay off a credit card balance and the total interest paid.",
            "parameters": {
                "type": "object",
                "properties": {
                    "balance": {"type": "number"},
                    "apr": {"type": "number"},
                    "monthly_payment": {"type": "number"}
                },
                "required": ["balance", "apr", "monthly_payment"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_credit_utilization",
            "description": "Calculate credit utilization ratio.",
            "parameters": {
                "type": "object",
                "properties": {
                    "balance": {"type": "number"},
                    "credit_limit": {"type": "number"}
                },
                "required": ["balance", "credit_limit"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_minimum_payment_cost",
            "description": "Show the total cost of only making minimum payments.",
            "parameters": {
                "type": "object",
                "properties": {
                    "balance": {"type": "number"},
                    "apr": {"type": "number"},
                    "minimum_payment_rate": {"type": "number", "default": 0.02},
                    "minimum_payment_floor": {"type": "number", "default": 25}
                },
                "required": ["balance", "apr"]
            }
        }
    }
]


def calculate_payoff_timeline(balance, apr, monthly_payment):
    monthly_rate = apr / 12
    if monthly_rate == 0:
        months = balance / monthly_payment
        return {"months": round(months), "total_interest": 0.0}
    min_interest = balance * monthly_rate
    if monthly_payment <= min_interest:
        return {"error": f"Payment ${monthly_payment} is too low to cover monthly interest ${min_interest:.2f}"}
    months = 0
    remaining = balance
    total_interest = 0.0
    while remaining > 0 and months < 1200:
        interest = remaining * monthly_rate
        total_interest += interest
        remaining = remaining + interest - monthly_payment
        months += 1
        if remaining < 0:
            remaining = 0
    return {"months": months, "years": round(months / 12, 1), "total_interest": round(total_interest, 2), "total_paid": round(balance + total_interest, 2)}


def calculate_credit_utilization(balance, credit_limit):
    utilization = balance / credit_limit
    pct = round(utilization * 100, 1)
    if utilization < 0.1:
        status = "excellent"
    elif utilization < 0.3:
        status = "good"
    elif utilization < 0.5:
        status = "moderate"
    else:
        status = "high"
    return {"utilization_pct": pct, "status": status}


def calculate_minimum_payment_cost(balance, apr, minimum_payment_rate=0.02, minimum_payment_floor=25):
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
    return {"months": months, "years": round(months / 12, 1), "total_interest": round(total_interest, 2)}


TOOL_HANDLERS = {
    "calculate_payoff_timeline": calculate_payoff_timeline,
    "calculate_credit_utilization": calculate_credit_utilization,
    "calculate_minimum_payment_cost": calculate_minimum_payment_cost,
}


def run_penny(conversation, client):
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + conversation

    while True:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )
        msg = response.choices[0].message

        if msg.tool_calls:
            messages.append(msg)
            for tc in msg.tool_calls:
                args = json.loads(tc.function.arguments)
                handler = TOOL_HANDLERS.get(tc.function.name)
                result = handler(**args) if handler else {"error": "unknown tool"}
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result)
                })
        else:
            return msg.content


def judge_response(response_text, criteria, client):
    """Ask GPT-4o-mini to judge whether the response meets each scoring criterion."""
    prompt = f"""You are evaluating an AI financial advisor response. Answer each question with YES or NO only.

Response to evaluate:
\"\"\"
{response_text}
\"\"\"

Question 1: Does the response reference at least one user-specific detail from their situation?
Criteria hint: {criteria['references_user_specific_detail']}

Question 2: Does the response include at least one concrete number or specific actionable step?
Criteria hint: {criteria['includes_concrete_number']}

Answer format (exactly):
Q1: YES or NO
Q2: YES or NO"""

    result = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=20,
        temperature=0,
    )
    text = result.choices[0].message.content.strip()
    q1 = "YES" in text.split("Q1:")[-1].split("Q2:")[0]
    q2 = "YES" in text.split("Q2:")[-1]
    return q1, q2


def main():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not set. Add it to .env or export it.")
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    test_cases_path = Path(__file__).parent / "test_cases.json"
    test_cases = json.loads(test_cases_path.read_text())

    print(f"Running Penny.io eval — {len(test_cases)} test cases\n")
    print("=" * 60)

    results = []
    passed = 0

    for tc in test_cases:
        print(f"\n[{tc['id']}] {tc['description']}")
        try:
            response = run_penny(tc["conversation"], client)
            print(f"  Response: {response[:120]}{'...' if len(response) > 120 else ''}")

            q1, q2 = judge_response(response, tc["scoring_criteria"], client)
            score = q1 and q2
            if score:
                passed += 1

            status = "PASS" if score else "FAIL"
            print(f"  References user detail: {'YES' if q1 else 'NO'}")
            print(f"  Includes concrete number: {'YES' if q2 else 'NO'}")
            print(f"  Result: {status}")

            results.append({
                "id": tc["id"],
                "description": tc["description"],
                "response_preview": response[:200],
                "references_user_detail": q1,
                "includes_concrete_number": q2,
                "passed": score
            })

        except Exception as e:
            print(f"  ERROR: {e}")
            results.append({
                "id": tc["id"],
                "description": tc["description"],
                "error": str(e),
                "passed": False
            })

        time.sleep(0.5)

    total = len(test_cases)
    score = passed / total
    print("\n" + "=" * 60)
    print(f"advice_quality_score = {passed}/{total} = {score:.2%}")
    print("=" * 60)

    output_path = Path(__file__).parent / "eval_results.json"
    output_path.write_text(json.dumps({
        "advice_quality_score": score,
        "passed": passed,
        "total": total,
        "results": results
    }, indent=2))
    print(f"\nDetailed results saved to {output_path}")

    return 0 if score >= 0.7 else 1


if __name__ == "__main__":
    sys.exit(main())
