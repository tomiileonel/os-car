# Escalation Rules

Escalate rather than guess when:

- a business rule is ambiguous;
- a schema change can destroy or invalidate data;
- a public API contract may break consumers;
- authentication or authorization boundaries are unclear;
- a new external provider is required;
- production data or infrastructure would be changed;
- a security control would need to be weakened;
- a secret or credential is required but unavailable;
- the requested work conflicts with an existing ADR or policy.

Every escalation should include:

1. The exact blocker.
2. The affected decision.
3. The safest viable options.
4. The recommended option, when evidence supports one.
