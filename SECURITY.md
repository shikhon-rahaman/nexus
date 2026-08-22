# Security Policy

## Scope

NEXUS is a hackathon project that operates on its configured Docker sandbox. It is designed to keep LLM-driven operations constrained to structured, reviewed paths rather than arbitrary shell execution.

## Safety Engine

Before the orchestrator can invoke a registry tool, `safety_engine.evaluate()` applies layered validation to the requested `ToolCall`:

1. **Tool allowlist** - rejects tools that are not registered in the policy.
2. **Per-tool argument checks** - validates relevant argument types and limits for supported operations.
3. **Allowed values** - restricts service names, log units, and other supported values to configured allowlists.
4. **Path safety** - restricts supported path arguments to configured safe roots and rejects traversal or shell-like substrings.
5. **Risk classification** - assigns a risk tier: `READ_ONLY`, `LOW`, `MEDIUM`, `HIGH`, or `BLOCKED`.
6. **Approval policy** - requires explicit human approval for `MEDIUM` and `HIGH` operations.

The Safety Engine is evaluated again immediately before an approved action executes. Human approval is not a safety bypass.

## No Direct LLM Command Execution

The LLM selects only a named tool and structured arguments. It does not create a shell command string.

The orchestrator is the only execution path: it evaluates the structured call through the Safety Engine before looking up a function in the Tool Registry. The registry runs fixed argument vectors with `shell=False` and routes them into the configured Docker sandbox using `docker exec`.

This design does not make operations risk-free. It reduces the execution surface by keeping actions within the implemented allowlists, validation rules, risk policy, and approval flow.

## Secrets

- `GROQ_API_KEY` is read from the process environment; it is not hardcoded in the source.
- Copy `backend/.env.example` to `backend/.env` and keep the actual key only in the local environment or a deployment secret store.
- The repository `.gitignore` excludes `.env` and `.env.*`, while permitting `.env.example` templates.
- Do not place API keys, tokens, passwords, or private endpoints in issues, commits, screenshots, or logs.

## Reporting a Vulnerability

For this hackathon project, please open an issue with a clear description of the vulnerability, affected component, reproduction steps, and potential impact. Do not include secrets in the report.

If the issue could expose credentials or enable unsafe execution, share only the minimum information needed to reproduce it and ask maintainers for a private reporting channel.
