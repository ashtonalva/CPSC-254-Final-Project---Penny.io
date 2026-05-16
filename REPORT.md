# Penny.io Project Report

## 1. What & Why
Financial advice doesn't work without context. If you tell me your balance is $1,500 in the first message and ask about a payoff strategy four messages later, Penny has to remember that. So every request sends the full conversation history to the API. Without it she'd either ask you to repeat yourself or just guess, and guessing on someone's debt situation is not okay.

Multimodal came up because the alternative is asking users to manually type out every line of their credit card statement. Nobody does that. People have a PDF from their bank or a photo on their phone. The upload endpoint base64-encodes the file and sends it straight to GPT-4o's vision, which reads the actual document without any OCR or preprocessing step.

Function calling I had to figure out through failure. Before tools existed in the app, I asked Penny to calculate payoff on $1,500 at 24.99% APR paying $50 a month. She said "around 3 years." The real answer is 4 years and 5 months with over $1,100 in interest. That's not close enough. Someone using that estimate to plan their budget would be off by over a year. After adding the tool functions, every number Penny gives comes from actual Python arithmetic. She writes the explanation. The function produces the number. That split is what makes the math trustworthy.

## 2. Iterations
### Version 1
Plain chat, no tools. Asked Penny to calculate payoff on a $1,500 balance at 24.99% APR paying $50/month. She said "around 3 years." Real answer is 4 years 5 months with $1,143 in interest. Close enough to sound right, wrong enough to actually hurt someone.

### Version 2
Added function calling. Same question now triggers `calculate_payoff_timeline`, which returns exact months, total interest, and balance history. Penny builds her response around those numbers instead of guessing. Also added streaming here. The original sync loop was blocking the event loop and freezing the whole chat.

### Version 3
Added the financial profile. Before this, Penny gave the same generic answer whether someone made $800/month or $4,000/month. Now the profile gets injected silently before every API call so she already knows your income, APR, and goal without you repeating yourself.

## 3. Code Walkthrough
The thing I spent the most time debugging was the streaming in `backend/main.py` around line 264.

`generate_chat_stream` is an async generator. It runs tool calls first. If the model needs to calculate something, it calls the function, puts the result back into the message history, and loops until there's nothing left to compute. Then it opens a streaming completion and sends each token to the browser as a Server-Sent Event. At the end it emits a `done` event with all the tool names and results bundled in, which is how the frontend knows what charts to render.

The switch to `AsyncOpenAI` happened because of a bug I couldn't explain at first. The original code did `for chunk in stream` inside an async function. That blocked FastAPI's event loop, so nothing got sent to the browser until the whole response was done. It looked like the app was frozen. Changing it to `async for chunk in stream` with the async client was a one-line fix that took me way too long to find.

The other thing worth explaining is `historyFor()` in `App.jsx`. When the user fills out their financial profile, that data doesn't go to the backend as a separate field. Instead, right before sending the conversation, I insert a fake user message containing the profile details and a fake assistant reply acknowledging it. Penny sees it as part of the chat history and uses it. The user never sees it. It's a bit of a workaround but it meant I didn't have to change the backend API at all, and the profile data stays in the browser.

## 4. AI Disclosure & Safety

Before function calling was in the app, Penny would answer math questions in plain text and just be wrong, not approximately wrong but stated like fact. I tested a payoff question and she was off by over a year. That's the kind of answer that could genuinely hurt someone who's trying to get out of debt and sets their monthly budget based on it.

The upload feature also fails in ways that are hard to predict. In one test it combined two separate charges into one category. In another it referenced a transaction that wasn't in the file. The model is reading an image of a document, not a structured spreadsheet, so there's inherent slop. It's still useful, but I wouldn't tell someone to treat it as a perfect record.

The bigger issue is that people might act on what Penny says. She doesn't know if you have other debts, a cosigner, or any context that would make standard advice wrong for your situation. The app shows a disclaimer but that's not much of a safeguard if someone reads "you could pay this off in two years" and actually reorganizes their finances around it. If this were a real product I'd want a much more visible warning that nothing here replaces talking to an actual advisor.
