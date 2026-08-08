# AGENTS.md — Adwaa AlSharq

## Purpose
This file defines the permanent execution rules for work on the «أضواء الشرق» project.
It is a working-policy file, not a project-history document.

## Before Any Change
- Inspect the current repository state before editing.
- Read the files directly related to the requested task.
- Check existing implementation before creating new files or duplicate logic.
- Consult the project Brain when architectural decisions, current state, or prior decisions matter.
- Do not assume the current implementation from memory when the repository can be inspected.

## Git Safety
- Never edit `main` directly.
- Perform implementation work on a dedicated branch created from the current approved `main`, or continue on an existing approved branch for the same task when appropriate.
- Do not Push unless the user explicitly requests or approves it.
- Do not Merge unless the user explicitly requests or approves it.
- Do not rewrite, force-update, or delete protected branches or safety branches unless explicitly authorized.
- Keep rollback and recovery paths intact.

## Scope Control
- Implement the smallest safe change that solves the requested problem.
- Do not modify files outside the task scope unless technically necessary.
- If another file must be changed, explain why.
- Do not perform unrelated cleanup, redesign, dependency changes, or refactoring.
- During bug fixes, avoid side refactors even if the surrounding code could be improved.
- Do not change approved architecture as part of a secondary fix.

## Data and Supabase Protection
- Treat production and customer data as sensitive project state.
- Do not delete, rewrite, migrate, or bulk-modify existing data without explicit approval.
- Do not change Supabase schema, tables, columns, functions, triggers, Storage configuration, or migrations unless the task clearly requires it and approval is explicit.
- Do not change RLS policies, authentication rules, or permissions without explicit approval.
- Prefer application-level fixes when they safely solve the problem without database changes.
- Do not use a workaround or indirect application logic merely to hide a real data-integrity, database, synchronization, or permissions problem in order to avoid a necessary database change.
- Never imply that a code backup also backs up live Supabase data.

## Existing Project Decisions
- Preserve approved architectural and product decisions.
- Use the Brain as the source for project decisions, architecture, known issues, and current state.
- Do not copy changing project history or feature status into this file.
- If Brain information appears stale or conflicts with the repository, report the discrepancy before relying on it.

## Conflict Rule
- If the current task conflicts with these safety rules or an approved project decision, stop before making changes.
- Clearly identify the conflict, its impact, and the decision required from the user.
- Do not silently override an existing rule or architectural decision.

## Implementation Quality
- Preserve existing behavior outside the requested change.
- Prefer isolated, reversible changes.
- Avoid duplicate state, duplicate event handlers, and duplicate business logic.
- Pay special attention to booking, subscription, payment, synchronization, and persistence flows because changes can affect stored state.

## Verification
- Run the tests appropriate to the changed area.
- Run syntax or static checks when relevant.
- Check the final diff for unintended changes.
- Do not claim browser, device, production, Supabase-live, or end-to-end testing unless it was actually performed.
- If a test could not be performed, state that clearly.

## Completion Report
After each implementation task, report:
- Branch used.
- Files changed.
- What was changed and why.
- Tests/checks actually executed and their results.
- Commit hash if a Commit was created.
- Explicitly confirm if no Commit was created.
- Any remaining risks, limitations, or untested areas.
- Any decision still required from the user.
- Whether Push or Merge occurred.

## Task Separation
- `AGENTS.md` = permanent execution and safety rules.
- Brain = project knowledge, architecture, decisions, history, and current state.
- Current prompt = the specific task to execute now.
- A future Skill, if adopted, should define a reusable workflow and must not duplicate this file or the Brain.
