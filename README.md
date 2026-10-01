# AgentShield

Runtime security firewall for LLM-powered AI agents.

When **Shield is off**, the agent can call tools directly. When **Shield is on**, every tool call must pass through AgentShield before execution.

```
Tool Request
    ↓
Prompt Injection Detector
    ↓
Trust Analyzer
    ↓
Risk Engine
    ↓
Policy Engine
    ↓
Action Firewall
    ↓
ALLOW / APPROVAL_REQUIRED / BLOCK
    ↓
Tool Execution
```

This repository provides an enterprise-ready runtime security firewall for LLM-powered AI agents, featuring CVSS v3.1-aligned risk scoring, full prompt auditing, human-in-the-loop approvals in the chat UI, and real-time policy enforcement.

### CVSS v3.1 Risk Scoring

Tool calls evaluated by AgentShield are scored according to standard CVSS v3.1 severity metrics:

| CVSS Score | Severity | Policy Decision |
| ----------: | -------- | --------------- |
| **0.0** | None | ALLOW |
| **0.1 – 3.9** | Low | ALLOW |
| **4.0 – 6.9** | Medium | APPROVAL_REQUIRED |
| **7.0 – 8.9** | High | BLOCK |
| **9.0 – 10.0** | Critical | BLOCK |


## Stack

- **Frontend:** Next.js, TypeScript, Tailwind CSS, shadcn/ui, Lucide React, Framer Motion
- **Backend:** Python, FastAPI, Pydantic, SQLite
- **Agent:** LangGraph with an LLM provider abstraction (no vendor SDK in core)

## Constraints

- LLM providers stay independent. Register a provider in `backend/app/llm/factory.py`.
- Email is simulated. The agent never sends real mail.
- File access is limited to `backend/mock_data/files`.
- The agent never executes shell commands.

## Project layout

```
agentshield/
├── frontend/                  Next.js app
│   ├── src/app/               App Router
│   ├── src/components/ui/     shadcn/ui
│   ├── src/lib/               API helpers
│   └── src/types/             Shared frontend types
├── backend/
│   ├── app/
│   │   ├── api/               FastAPI routes
│   │   ├── agent/             LangGraph stubs
│   │   ├── shield/            Security pipeline modules
│   │   ├── tools/             Browser, filesystem, email
│   │   ├── llm/               Provider factory + mock
│   │   ├── db/                SQLite session
│   │   └── sandbox/           Path jail for the mock filesystem
│   ├── mock_data/files/       Controlled mock filesystem
│   └── data/                  SQLite database files
├── docker-compose.yml
└── README.md
```

## Local development

### Backend

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate

copy .env.example .env   # Windows
# cp .env.example .env   # macOS / Linux

pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check: [http://localhost:8000/health](http://localhost:8000/health)

### Frontend

```bash
cd frontend
copy .env.example .env.local   # Windows
# cp .env.example .env.local   # macOS / Linux

npm install
npm run dev
```

App: [http://localhost:3000](http://localhost:3000)

## Docker

From the repository root:

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000

Copy `backend/.env.example` to `backend/.env` if you want to override the default mock LLM settings.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `SHIELD_ENABLED` | `true` | Shield on/off |
| `LLM_PROVIDER` | `mock` | Provider key used by the factory |
| `LLM_API_KEY` | empty | Provider credential (unused for mock) |
| `LLM_MODEL` | empty | Model name for a real provider |
| `LLM_BASE_URL` | empty | Optional OpenAI-compatible API base URL |
| `DATABASE_URL` | `sqlite:///./data/agentshield.db` | SQLite path |
| `SANDBOX_FS_ROOT` | `./mock_data/files` | Mock filesystem root |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Frontend API base URL |

## Key Capabilities
- **Chatbot with Inline Approvals:** Interactive ChatGPT-style AI agent with tool calls, direct inline Approve / Reject controls, and security notifications.
- **Audit Logs with Prompt Visibility:** Complete request lifecycle auditing including the user prompt that triggered the agent, CVSS score breakdown, and security policy factors.
- **CVSS v3.1 Risk Engine:** Rigorous 0.0–10.0 risk assessment evaluating tool baseline, untrusted sources, prompt injection, sensitive data, and external exfiltration vectors.
- **AgentDojo Benchmark & Defense Pipeline:** Official AgentDojo integration (`AgentShieldDojoDefense`, `AgentShieldPIDetector`) supporting direct benchmark evaluation across `workspace`, `banking`, `slack`, and `travel` suites.

