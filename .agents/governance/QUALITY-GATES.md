# Quality Gates

## G0 — Requirements
Owner: `product-requirements`

Pass criteria:
- Requirements are explicit.
- Acceptance criteria are testable.
- Out-of-scope items are known.

## G1 — Domain
Owner: `domain-architect`

Pass criteria:
- Entities and aggregates are defined.
- Business invariants are explicit.
- State transitions are understood.
- Open domain questions are resolved or escalated.

## G2 — Architecture
Owner: `software-architect`

Pass criteria:
- Module boundaries are defined.
- Dependency direction is clear.
- Material trade-offs have an ADR.
- New infrastructure is justified.

## G3 — Data
Owner: `database-prisma`

Pass criteria:
- Schema is consistent with domain invariants.
- Critical constraints exist.
- Query patterns and indexes are reviewed.
- Migrations are reproducible and safe.

## G4 — Security
Owners: `auth-policy`, `security-review`

Pass criteria:
- Authentication is correct.
- Server-side authorization is enforced.
- Tenant/resource isolation is verified where applicable.
- No unresolved CRITICAL/HIGH security finding exists.

## G5 — Implementation
Owners: builders

Pass criteria:
- Code follows architecture.
- Runtime validation exists at trust boundaries.
- TypeScript remains strict and coherent.
- No unrelated changes are introduced.

## G6 — Verification
Owners: `qa-test`, `accessibility-specialist`, `observability-engineer`

Pass criteria:
- Relevant unit/integration/E2E tests pass.
- Critical negative paths are covered.
- Accessibility risks are addressed.
- Critical flows have appropriate observability.

## G7 — Independent Engineering Review
Owners: `code-review`, `performance-engineer`

Pass criteria:
- No unresolved blocker/high code issue.
- Performance risks are measured or explicitly accepted.
- The implementation remains maintainable and within architecture boundaries.

## G8 — Production Release
Owners: `devops`, `release-manager`

Required checks:
- Deployment plan exists.
- Migration plan exists.
- Environment configuration is complete.
- Rollback/recovery is defined.
- Observability/alerts are operational.
- Release evidence is recorded.

## Rule

Builders cannot approve their own work.

Reviewers may block completion.

A gate can be skipped only by an explicit human decision documented in the task/release record.
