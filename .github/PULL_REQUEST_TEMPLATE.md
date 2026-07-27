## Summary

Describe the problem and the implemented solution.

## Scope

- Affected components:
- User-visible behavior:
- Out of scope:

## Interface and security impact

Describe any effect on CLI output, JSON-RPC, configuration, persistent data, permissions, network access, audit, transcripts, or secret handling. Write `None` when there is no impact.

## Verification

List the exact commands you ran and summarize the results.

```text
./tools/check.sh
```

## Checklist

- [ ] The change is focused and does not include unrelated generated files or formatting.
- [ ] Tests cover the new behavior or regression, including relevant failure paths.
- [ ] Public behavior and configuration changes are documented.
- [ ] Protocol examples and goldens are updated when the wire contract changes.
- [ ] Security assumptions and sensitive-data handling were reviewed.
- [ ] No API key, token, private path, user data, or sensitive log is included.
- [ ] Dependency and lockfile changes are intentional and explained.
- [ ] I have the right to submit this contribution under the MIT License.

## Follow-up work

List known limitations or follow-up issues. Write `None` if the change is complete.
