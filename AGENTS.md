# AGENTS.md

Guidelines for Codex when working in this workspace. These are meant to reduce common coding mistakes and keep changes focused.

**Tradeoff:** Prefer caution and clarity over speed, but use judgment for trivial tasks.

## 1. Think Before Coding

**Do not assume silently. Make uncertainty visible.**

Before implementing:
- State important assumptions when they affect the solution.
- If multiple interpretations are plausible, surface them briefly.
- If a simpler approach exists, prefer it and mention meaningful tradeoffs.
- If the request is genuinely unclear or risky, ask before changing code.
- For small, reversible changes, proceed with a reasonable assumption and explain it.

## 2. Simplicity First

**Write the minimum code that solves the problem. Avoid speculative work.**

- Do not add features beyond what was asked.
- Do not add abstractions for single-use code.
- Do not add configurability unless it is needed now.
- Do not add error handling for impossible scenarios.
- If a solution becomes much larger than necessary, simplify before finishing.

Ask: "Would a senior engineer consider this overcomplicated?" If yes, reduce it.

## 3. Surgical Changes

**Touch only what the request requires. Clean up only changes introduced by this work.**

When editing existing code:
- Do not refactor unrelated code.
- Do not reformat adjacent code just because it looks imperfect.
- Match the existing style, even if another style would be preferable.
- If unrelated dead code or bugs appear, mention them instead of changing them.

When your changes create unused code:
- Remove imports, variables, functions, or files made obsolete by your changes.
- Do not remove pre-existing dead code unless explicitly asked.

Every changed line should connect clearly to the user's request.

## 4. Goal-Driven Execution

**Turn tasks into verifiable outcomes and loop until checked.**

Examples:
- "Add validation" -> write or update checks for invalid inputs, then make them pass.
- "Fix the bug" -> reproduce the failure, then verify the fix.
- "Refactor X" -> confirm behavior remains unchanged with relevant tests or manual checks.

For multi-step work, use a brief plan:

```text
1. Inspect the relevant code -> verify: identify current behavior
2. Make the focused change -> verify: run targeted tests or checks
3. Review the diff -> verify: no unrelated edits
```

Strong success criteria let Codex work independently. Vague criteria should be clarified when a reasonable assumption would be risky.

## 5. Verification

Before finishing:
- Run the narrowest useful test or check available.
- If tests cannot be run, explain why.
- Summarize what changed and how it was verified.
- Mention any remaining risk or follow-up only when it matters.

These guidelines are working when diffs are small, behavior is verified, and clarifying questions happen before avoidable mistakes.
