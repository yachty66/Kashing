# WhatsApp CFO agent

A shared AI CFO that a **manager** and **employees** message on WhatsApp. One
bot number; the sender's phone number is their identity and role.

- **Manager** — ask about team spending, approve/reject expenses, issue FPS
  payment QR codes to employees.
- **Employee** — request an FPS QR to pay on the company's behalf, send a
  receipt photo (parsed automatically by a vision model), check their expenses.

The agent reuses the existing OpenRouter setup. Receipts are read with a vision
model (Gemini by default); QR codes follow the Hong Kong FPS standard.

## Architecture

```
Manager 📱 ─┐                         ┌─ replies + QR images + approval prompts
            ├─▶ Twilio WhatsApp ─▶ /api/whatsapp   (stateless webhook)
Employee 📱 ┘   (one number)              │  sender phone → user + role
                                          ▼
                               lib/agent/respond.ts   (role-gated tool-calling)
                                          │
                ┌─────────────────────────┼──────────────────────────┐
                ▼                          ▼                           ▼
        manager tools              employee tools               receipts (vision)
        list/summary/approve/      request_qr / my_expenses     parseReceipt → Gemini
        reject / issue_qr
                                          │
                                          ▼
                  DB: users, qr_issuances, expenses, agent_messages
```

- QR PNGs are served at `GET /api/qr/{issuanceId}` so Twilio can attach them.
- `PUBLIC_BASE_URL` must be the **publicly reachable** URL (Twilio fetches the
  webhook and the QR images), so use ngrok in local dev.

## Setup

### 1. Database

Fill `DATABASE_URL` in `.env.local`, then push the schema (now includes the new
tables):

```bash
npm run db:push
```

### 2. OpenRouter

Set `OPENROUTER_API_KEY`. `AGENT_MODEL` and `VISION_MODEL` are optional
overrides (defaults: Claude Sonnet for chat, Gemini Flash for receipts).

### 3. Twilio WhatsApp sandbox

1. Create a free account at [twilio.com](https://www.twilio.com).
2. Console → **Messaging → Try it out → Send a WhatsApp message**. This opens
   the **WhatsApp Sandbox**.
3. Note the sandbox number (e.g. `+1 415 523 8886`) and the **join code**
   (e.g. `join easy-tiger`).
4. Copy **Account SID** and **Auth Token** from the console dashboard into
   `.env.local` as `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`. Set
   `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (your sandbox number).
5. **Both demo phones must join the sandbox**: from each phone's WhatsApp, send
   the join code (e.g. `join easy-tiger`) to the sandbox number. (Sandbox links
   expire after ~24h of inactivity — just re-send the join code.)

### 4. Public URL + webhook

Run the app and expose it:

```bash
npm run dev                      # http://localhost:3001
npx ngrok http 3001              # in another terminal → https://<id>.ngrok-free.app
```

Set `PUBLIC_BASE_URL=https://<id>.ngrok-free.app` in `.env.local` (restart
`npm run dev` after changing env).

In the Twilio sandbox settings, set **"When a message comes in"** to:

```
https://<id>.ngrok-free.app/api/whatsapp     (HTTP POST)
```

### 5. Seed the two demo users

Set in `.env.local` (E.164, no `whatsapp:` prefix):

```env
MANAGER_PHONE=+852...      MANAGER_NAME=Alex (Manager)
EMPLOYEE_PHONE=+852...     EMPLOYEE_NAME=Sam (Employee)
```

Then:

```bash
npm run seed
```

## Demo script

**Employee (Sam):**
1. "I need HK$480 for a client lunch" → receives an FPS QR; manager is notified.
2. Pays, then sends a **photo of the receipt** → "Got your receipt — HK$480 at
   Maxim's. Submitted for approval ✅ (#1)". Manager is pinged to approve.

**Manager (Alex):**
1. Gets: "New expense from Sam: HK$480 at Maxim's (#1). Reply 'approve 1'…"
2. "approve 1" → Sam is notified it was approved.
3. "How much has the team spent this week?" → answered from the data.
4. "Issue HK$200 to Sam for a taxi" → Sam receives the QR.

## Notes & limits

- **Twilio's webhook must respond within ~15s.** Vision + LLM usually finish
  well under that; if a reply ever double-sends, that's Twilio retrying a slow
  request.
- **Single company / dataset.** Only `users`, `qr_issuances`, `expenses` are
  user-scoped; the bank tables stay single-dataset (the company's books). True
  multi-tenant separation is future work.
- **QR codes use a demo FPS merchant ID.** They scan as valid FPS strings but
  resolve to the placeholder account unless you set a real `FPS_MERCHANT_ID`.
- **Per-employee permissions** (limits, who can issue) are intended as a future
  manager UI; today any employee can request a QR and the manager approves all.
```
