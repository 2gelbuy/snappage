# Agent Instructions

> Mirrored across CLAUDE.md, AGENTS.md, GEMINI.md.

You operate within a 3-layer architecture that separates concerns. LLMs are probabilistic, business logic is deterministic. This system fixes that mismatch.

Multiple agents can work in parallel across different IDEs. Each owns their modules. Human coordinates.

---

## The 3-Layer Architecture

**Layer 1: Directives (What to do)**
- SOPs in Markdown, live in `directives/`
- Define goals, inputs, tools to use, outputs, edge cases
- Natural language instructions

**Layer 2: Orchestration (Decision making)**
- This is you. Job: intelligent routing.
- Read directives, call tools in right order, handle errors, update directives with learnings
- Example: read `directives/scrape_website.md` → run `tools/scrape_single_site.py`

**Layer 3: Execution (Doing the work)**
- Deterministic scripts in `tools/`
- Any language: Python, Node, Bash, Go. Pick best for task.
- Handle API calls, data processing, file operations
- Reliable, testable, well-commented
- **Idempotent:** same input = same output. Safe to retry.
- **Self-diagnostic:** missing env var or bad input = clear error message, not silent fail.

**Why this works:** 90% accuracy per step = 59% success over 5 steps. Push complexity into deterministic code. You focus on decisions.

---

## Modes

| Mode | When | Coordination |
|------|------|--------------|
| **Light** | Prototypes, one-offs | Human coordinates verbally |
| **Standard** | Products, ongoing work | MODULE.md defines boundaries |

Default to Light. Add MODULE.md when boundary conflicts appear.

---

## Multi-Agent Rules

**Ownership:** Each module has one owner.
```
frontend/   → Claude/Cursor
backend/    → Gemini/VS Code
analysis/   → DeepSeek/Windsurf
```

**The Rule:** Don't edit files you don't own. Need changes elsewhere? Tell human or leave note in `requests/`.

**Fast Track:** For urgent fixes across boundaries:
1. Make the change
2. Immediately notify owner
3. Add line to CHANGELOG: `[date] FAST-TRACK: [what] [why] [by whom]`

Don't abuse. 3+ fast-tracks per week = boundaries are wrong, discuss with human.

---

## MODULE.md

Required in Standard mode. Keep short:

```markdown
# Backend API

## Owner
Gemini / VS Code

## Does
- REST API for data
- Auth endpoints

## Does NOT
- Frontend (that's frontend/)
- Payments (that's billing/)

## Interface
POST /api/users → { name, email } → { id }
GET /api/users/:id → { user }

## Version
v1.2 — Breaking changes require version bump + notify dependents
```

---

## Operating Principles

**1. Check for tools first**
Before writing code, check `tools/`. Only create new if nothing fits.

**2. Self-anneal when things break**
```
Example: You hit OpenAI rate limit
→ Read error: "429 Too Many Requests"
→ Check API docs: find batch endpoint, 100 items/request
→ Rewrite script to batch
→ Test with 5 items, then 100
→ Update directive: "Use batch endpoint, max 100 items, add 1s delay between calls"
```

**3. Update directives as you learn**
Directives are living documents. Discover API limits, better approaches, edge cases → update. Don't create new directives without asking.

**4. Watch costs**
- API calls cost money. Batch when possible.
- LLM tokens cost money. Don't loop unnecessarily.
- Before expensive operations (>$0.50 or paid API): confirm with user.

---

## Self-Annealing Loop

When something breaks:
```
1. Capture error + full context
2. Diagnose root cause (not just symptoms)
3. Fix the tool
4. Test: original case works + edge case that broke it
5. Update directive with new knowledge
6. System is now stronger
```

Max 3 attempts on same error. After that → ask human.

---

## Common Failures

| Failure | Symptom | Fix |
|---------|---------|-----|
| Context overflow | Agent forgets early instructions | Split task, summarize context |
| Hallucinated tool | Agent invents function that doesn't exist | List available tools explicitly in directive |
| Infinite retry | Same error, repeated attempts | Max 3 retries, then escalate |
| Cost runaway | Unexpected API bills | Set limits, confirm before expensive ops |
| Module conflict | Two agents edit same file | Respect ownership, Fast Track only for fires |
| Stale directive | Instructions outdated | Update after every significant learning |

---

## Decision Log (When It Matters)

For significant choices, add one line to `decisions.md`:

```
[date] | [decision] | [why] | [alternatives rejected]
2025-01-07 | PostgreSQL over MongoDB | Team knows Postgres, schema is stable | MongoDB: would need training
2025-01-08 | Batch API calls | Rate limited at 60/min | Individual calls: too slow
```

No lengthy ADR documents. One line captures 80% of value.

---

## File Organization

**Light mode:**
```
project/
├── directives/      # SOPs
├── tools/           # Scripts (any language)
├── .tmp/            # Intermediate files (gitignored)
├── .env             # Secrets (gitignored)
├── .env.example     # Template with empty keys + comments
└── README.md
```

**Standard mode:** Add per Light, plus:
```
├── [module]/        # Each module folder
│   └── MODULE.md    # Ownership + interface
├── requests/        # Cross-module asks
└── decisions.md     # One-line decision log
```

**Principles:**
- Deliverables go to cloud (Sheets, Drive, S3, etc.)
- Local files are for processing only
- `.tmp/` can always be deleted and regenerated
- Secrets stay in `.env`, never in code or logs

---

## Quick Reference

```
Before task    → Understand goal → Check tools/ → Smallest first step
Execution      → One step → Verify → Next step (never chain blind)
Cross-module   → Don't touch → Tell human or Fast Track for fires
Failure        → 3 retries max → Ask human
Costs          → Confirm before expensive ops (>$0.50 or paid API)
Learning       → Update directive immediately after discovery
```

**The mantra:** Read directives, make decisions, call tools, handle errors, improve the system.
