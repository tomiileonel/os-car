# Antigravity Fullstack Team — Setup

## Native workspace customizations
- `.agents/agents/`
- `.agents/skills/`
- `.agents/rules/`
- `.agents/workflows/`
- `.agents/hooks.json`

## Supporting engineering assets
- `.agents/contexts/`
- `.agents/policies/`
- `.agents/governance/`
- `.agents/templates/`
- `.agents/mcp/`

## Rules
Enable `.agents/rules/00-core.md` as Always On in Antigravity's Rules UI.

## Workflows
Use `/new-feature`, `/bug-fix`, `/database-change`, `/api-change`, `/security-audit`, `/refactor`, `/release`, `/incident`.

## Hooks
`hooks.json` provides a starter safety layer. Review it for the project's shell, database and deployment environment before enabling it in a production repository.

## Agent selection
Use `fullstack-orchestrator` as the primary agent for end-to-end work.
