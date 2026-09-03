# Release Policy

- No production release before G8.
- No unresolved CRITICAL/HIGH security finding may ship.
- Production-impacting database migrations require explicit review.
- Destructive operations require explicit human approval.
- Every production release must have a rollback or recovery strategy.
- Required environment variable names must be documented; secret values must never be committed.
- Deployment evidence must be captured.
- Release notes should identify breaking changes and operational considerations.
