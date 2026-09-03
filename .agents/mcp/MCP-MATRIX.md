# MCP Matrix

Principle: minimum necessary access.

| Capability | Preferred agents | Production access |
|---|---|---|
| Git/GitHub | orchestrator, devops, code-review | ask |
| Browser/UI inspection | frontend, ui-ux, qa, accessibility | no |
| PostgreSQL | database-prisma, performance | restricted/ask |
| Payment provider | integration-specialist, security-review | restricted/ask |
| Observability | observability-engineer, devops, performance | restricted |
| Cloud infrastructure | devops | ask |
| Documentation/search | product-requirements, architect, orchestrator | limited |

## Rules

- Do not attach every MCP server to every agent.
- Production credentials are never exposed to general-purpose agents.
- Read-only access should be preferred for reviewers.
- Any write-capable production integration should require an explicit approval path.
