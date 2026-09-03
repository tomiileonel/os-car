# Release

Description: Production readiness gate.

## Steps
1. Lint/typecheck/tests/build.
2. Migration safety.
3. Security review.
4. Code review.
5. Verify environment variable names only.
6. Verify observability.
7. Verify rollback/recovery.
8. release-manager.
9. Proceed only when G8 passes.
