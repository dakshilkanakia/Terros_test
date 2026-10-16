# Submission

Start time: 1:46 PM (approximate)
End time: <fill in before the final commit>

## Opportunities, ranked

1. **Overdue view ignores the rep filter.** Worked on it. The Overdue tab is the "who is falling behind" screen managers open before check-in, and filtering it by rep returned the whole team. Out-of-scope `repId` also returned 200 instead of the documented 403.
2. **Reps can complete teammates' tasks.** Worked on it. This is an authorization bug on a write path: a rep could complete any task on their team, though the domain says reps only see and act on their own.
3. **Two sources of truth for visibility** (`TaskScopeResolver` for reads, `canAccess` in the service for writes) and filter acceptance declared in three places (route, service type, query definition). This is the root cause of 1 and 2. Worked on it, as part of both fixes.
4. **No HTTP-level tests.** `supertest` is installed and the README says API tests use it, but none existed. Worked on it: added route tests covering authorization, scoping and error codes.
5. **Completing a task wipes the list.** Worked on it. The whole table was replaced by "Loading tasks…" after every completion, so managers working through a list lost their place; a failed completion could also leave a stale row or hide its own error.
6. **Malformed request bodies return 500** (and get logged as server errors) instead of the documented 400. Worked on it: low impact today since no endpoint reads a body, but cheap and it is an API contract violation.
7. **Not worked on:** README lists a `lint` script and ESLint that don't exist.

## What you changed

- `overdueTasksQuery` now accepts `repId`. The engine also passes the caller's raw `repId` to scope resolution, so a query definition that forgets to list it in `accepts` can no longer skip the visibility check.
- Added `canAccessTask(scope, task)` next to the scope resolver. `completeTask` uses it instead of its own team check, so reads and writes share one rule: managers by team, reps by assignee.
- Added `taskRoutes.test.ts` (10 HTTP tests) and `scope.test.ts`, which asserts for every fixture user and task that `canAccessTask` agrees with what the list query returns. This guards against the read and write rules drifting apart again.
- `useAsync` gained `refresh()`, which refetches without leaving the success state, plus `refreshing` and `refreshError`. `reload()` and the behavior on dependency changes are unchanged. `TaskList` refreshes after a completion (also after a failed one, so a 409 clears the stale row), keeps the "Saving…" button disabled until the refresh settles, keeps the old rows with a small "Could not refresh" message and a Refresh button if the refresh fails, and shows completion errors even when the list is empty.
- `errorHandler` maps Express middleware errors with a 4xx status (malformed JSON, oversized body) to the documented `invalid_request` shape instead of 500, and no longer logs them as server errors.

One commit per change, each with its tests.

## What you decided not to do

- The README `lint` mismatch (item 7). Real but doc-only and low impact next to the other work.
- Optimistic local updates after completing a task. A refetch keeps overdue status, filters and ordering authoritative on the server, at the cost of one extra request.
- A larger refactor to make the repository answer access questions (`findTasks` by scope plus id). It would reshape the repository interface for little gain here; a single pure function gives the same guarantee.
- Changing the web app for the two authorization bugs. Both are API-side; the UI already sent the right requests and displayed the API's flags. The only web change is the refresh behavior after completing a task.
- Assumption: where the docs and README disagree with the code (for example the `lint` script), I treated the docs and the domain rules as the intended behavior.

## Verification

- Baseline before changes: 17 tests passing, `tsc` clean.
- Reproduced both bugs against the real app with a throwaway script (not committed) before touching code. Controls confirmed correct behavior elsewhere (`/api/tasks?repId=` already returned 403; other-team completion already returned 404).
- Wrote the route tests first. Four failed on exactly the two bugs; the rest passed as controls.
- After all changes: 37 tests passing, `tsc` clean. New tests cover the HTTP routes (authorization, scoping, 401/403/404/409), read/write scope parity, error shapes (400/413/500), and the web list during and after a completion (rows stay visible, failed refresh, 409, empty list, loading on filter change).
- Checked by hand against the running app: Overdue tab filtered by Alicia and Jordan shows one task each; a rep completing a teammate's task gets 404 while completing their own gets 200; malformed JSON returns 400 with the standard error body.
- I did not manually exercise the new refresh error path in the browser; it is covered by component tests only.

## Working with AI

I set rules at the start: the AI does not edit without my approval, it checks the architecture behind a bug before fixing it, commits stay small, and replies stay short. I had it read all docs and source and run the baseline before proposing anything, then reproduce each bug before fixing.

Example of a suggestion I directed: my rule to check the architecture before fixing a bug turned a one-line `accepts` fix into two findings: filters were silently stripped in front of a security check, and write access used a separate rule from read access. The AI laid out three options for bug 2 (minimal one-line fix, a shared `canAccessTask`, or a repository-level change); I chose the shared function.

Example of a verified and gated suggestion: to keep the first commit green, the AI wanted to mark the bug 2 test `it.skip`. The tool's auto-mode classifier blocked the edit as a security-test removal. The AI stopped and asked me instead of working around it; I approved it for that one commit only, and the test was unskipped in the next commit. Both fixes are in a git history that shows the skip and its removal.
