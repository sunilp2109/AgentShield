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

This repository currently contains project structure, development configuration, and a mock tool system. The agent runtime and security pipeline are not implemented yet.

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

## Next steps

1. Wire tool calls through the executor and Shield pipeline when `SHIELD_ENABLED=true`.
2. Build the console UI for chat, approvals, and firewall decisions.
