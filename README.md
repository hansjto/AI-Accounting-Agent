# AI Accounting Agent

> **NM i AI 2026** (Norwegian AI Championship) — Task 2: Tripletex Accounting Automation
>
> This project was built for the [NM i AI 2026](https://ainm.no/) competition, where AI agents solve real-world accounting tasks against the Tripletex ERP system. The agent receives natural language prompts describing accounting tasks and autonomously executes them via the Tripletex API.

An LLM-powered service that automates accounting tasks in [Tripletex](https://www.tripletex.no/) via natural language prompts.

The agent receives a task description in any language, reasons over it, and executes the necessary Tripletex API calls autonomously until the task is complete.

## How it works

1. A POST request arrives at `/solve` with a prompt and Tripletex credentials
2. Claude Opus 4.6 receives the prompt along with a dynamically assembled system prompt describing the Tripletex API
3. Claude writes Python code that calls the Tripletex API tools via code execution
4. The API results are fed back to Claude, which continues reasoning and calling until the task is done
5. Optionally, a second Claude call (Sonnet 4.6) verifies whether the task was completed correctly

```
User prompt
  → Claude reasons → writes Python code
  → Code calls tripletex_get / tripletex_post / ...
  → Agent executes the API call → returns result to Claude
  → Claude reasons again → writes more code
  → ... (repeats until done)
  → Returns { status: "completed" }
```

## API

### `POST /solve`

Requires a Bearer JWT token in the `Authorization` header.

**Request body:**
```json
{
  "prompt": "Opprett kunden Strandvik AS med organisasjonsnummer 808795132.",
  "tripletex_credentials": {
    "base_url": "https://your-tripletex-instance/v2",
    "session_token": "your-session-token"
  },
  "files": [
    {
      "filename": "invoice.png",
      "content": "<base64-encoded>",
      "mime_type": "image/png"
    }
  ],
  "use_sandbox": false
}
```

| Field | Required | Description |
|---|---|---|
| `prompt` | Yes | The accounting task in any language |
| `tripletex_credentials` | Yes | Tripletex API base URL and session token |
| `files` | No | File attachments — images (base64) and PDFs |
| `use_sandbox` | No | Enables verification mode (see below) |

**Response (normal mode):**
```json
{ "status": "completed" }
```

**Response (sandbox mode):**
```json
{
  "status": "completed",
  "sandbox": true,
  "verified": true,
  "summary": "Created customer Strandvik AS with org number 808795132.",
  "tool_calls": 3,
  "errors": []
}
```

## Supported tasks

The agent can handle any Tripletex task expressed in natural language, including:

- Customer, supplier, employee, product, project, and department management
- Order creation → invoice conversion → sending
- Invoice payment registration and credit notes
- Foreign currency invoices with exchange rate differences (agio/disagio)
- Supplier invoice registration (via voucher with Leverandorfaktura type)
- Travel expenses, per diem, mileage allowances
- Timesheet entries and month approval
- Salary/payroll transactions (with manual voucher fallback)
- Voucher creation, reversal, and correction vouchers
- Bank reconciliation from CSV statements
- Fixed asset management and depreciation
- Month-end and year-end closing
- Balance sheets, trial balance, and financial reporting
- Custom accounting dimensions
- Cost analysis and project creation

Prompts can be written in Norwegian, Nynorsk, English, German, French, Spanish, Portuguese, or any other language.

## System prompt

The system prompt is assembled dynamically per request (`src/services/systemPrompt.ts`):

- **Base block** — always loaded. Contains API conventions, field schemas, correction voucher guidance, foreign currency flows, salary procedures, and common task patterns (~550 lines).
- **Dynamic modules** — loaded only when keywords in the prompt match. Four modules exist: Bank Reconciliation, Asset Management, Financial Reporting, and Salary Reconciliation.

All blocks use Anthropic prompt caching (`cache_control: ephemeral`) to reduce latency and cost on repeated calls.

## Tools

The agent uses **code execution** — Claude writes Python code that calls the Tripletex API tools:

### API tools (called from Python via `await`)

| Tool | HTTP method | Purpose |
|---|---|---|
| `tripletex_get` | GET | List or retrieve resources |
| `tripletex_post` | POST | Create a single resource |
| `tripletex_post_list` | POST `/*/list` | Create multiple resources in one call |
| `tripletex_put` | PUT | Update a resource or trigger an action (`:send`, `:invoice`, `:approve`) |
| `tripletex_del` | DELETE | Remove a resource |

### Compound tools (multi-step flows)

| Tool | Purpose |
|---|---|
| `create_invoice` | Full invoice flow: customer lookup → product lookup → VAT → order → lines → invoice → send |
| `register_payment` | Find customer → find unpaid invoice → look up payment type → register payment |
| `create_supplier_invoice` | Find/create supplier → expense account → VAT → create voucher with Leverandorfaktura type |
| `setup_project` | Find employee/customer → grant entitlements → create project → create and link activity |

## Dashboard

The service includes a built-in dashboard at `GET /dashboard` for monitoring agent performance:

- Live statistics: total runs, average tool calls, errors, elapsed time
- Expandable run details with full tool timeline
- Score tracking from the competition evaluator
- Auto-refresh every 10 seconds

API endpoints: `GET /api/runs`, `GET /api/runs/:filename`, `POST /api/score`, `POST /api/scores`

## Sandbox mode

When `use_sandbox: true`, the service:
1. Uses sandbox Tripletex credentials from environment variables instead of the request
2. After the agent finishes, sends the full conversation history to Claude Sonnet 4.6 for verification
3. Returns `verified: true/false`, a one-sentence `summary`, `tool_calls` count, and any HTTP errors

This is useful for testing prompt changes and evaluating task success rate without manual inspection.

## Deployment

The service is containerized and deployed to Google Cloud Run:

```bash
gcloud run deploy solver-service --source . --project=YOUR_PROJECT --region=europe-west4
```

**Dockerfile:** Uses `oven/bun:1` as base image, exposes port 5000.

## Development

**Prerequisites:** [Bun](https://bun.sh/)

```bash
bun install
```

**Run locally:**
```bash
bun run dev         # with hot reload
bun run start       # production
```

**Environment variables:**
```
ANTHROPIC_API_KEY=          # Required
JWT_SECRET=                 # Required — used to verify Bearer tokens
TRIPLETEX_BASE_URL=         # Required for sandbox mode
TRIPLETEX_SESSION_TOKEN=    # Required for sandbox mode
GCP_PROJECT_ID=             # For GCS logging and dashboard
GCP_REGION=                 # For GCS logging
```

**Test a prompt against the sandbox:**
```bash
bun run solve -- --sandbox "Opprett kunden Bergendahl Consulting AS med org.nr 912345678"
bun run solve:local -- --sandbox "Your prompt here"   # targets localhost:3000
```

**Run tests:**
```bash
bun test              # all tests
bun test tests/unit   # unit tests only
```

## Project structure

```
src/
  app.ts                        # Express app setup
  index.ts                      # Server entry point (port 5000)
  types.ts                      # Shared TypeScript types
  errors.ts                     # Custom error classes
  routes/
    solveRouter.ts              # POST /solve route + Joi validation
    dashboardRouter.ts          # Dashboard UI + API endpoints for runs/scores
  services/
    claudeAgent.ts              # Agent loop: Claude + code execution + tool fulfillment
    solveService.ts             # Orchestrates agent, handles sandbox mode
    systemPrompt.ts             # Dynamic system prompt assembly (base + modules)
    compoundTools.ts            # Multi-step accounting flows (invoice, payment, supplier, project)
    tripletexApi.ts             # Tripletex API wrapper with error handling and call logging
    tripletexClient.ts          # HTTP client with Basic auth
    requestLogger.ts            # Logs requests/results to stdout and GCS
    gcsService.ts               # Google Cloud Storage operations for run retrieval
  middleware/
    authMiddleware.ts           # JWT / API key Bearer token verification
    errorHandler.ts             # Global Express error handler
scripts/
  solve.ts                      # CLI for testing prompts
  generate-token.ts             # Generate JWT tokens
  test-agent.ts                 # Test agent with env credentials
  test-all.ts                   # Batch test runner
tests/
  unit/                         # Unit tests
  integration/                  # Integration tests
```

## Tech stack

- **Runtime:** [Bun](https://bun.sh/)
- **Framework:** Express
- **AI:** Anthropic Claude (Opus 4.6 for agent, Sonnet 4.6 for verification)
- **Validation:** Joi / celebrate
- **Auth:** JWT (jsonwebtoken)
- **Logging:** Google Cloud Storage
- **Deployment:** Google Cloud Run
