# Submission

Start time: 1:46 PM (approximate)
End time: <fill in before the final commit>

## Opportunities, ranked

1. **Overdue view ignores the rep filter.** Worked on it. The Overdue tab is the "who is falling behind" screen managers open before check-in, and filtering it by rep returned the whole team. Out-of-scope `repId` also returned 200 instead of the documented 403.
2. **Reps can complete teammates' tasks.** Worked on it. This is an authorization bug on a write path: a rep could complete any task on their team, though the domain says reps only see and act on their own.
3. **Two sources of truth for visibility** (`TaskScopeResolver` for reads, `canAccess` in the service for writes) and filter acceptance declared in three places (route, service type, query definition). This is the root cause of 1 and 2. Worked on it, as part of both fixes.
4. **No HTTP-level tests.** `supertest` is installed and the README says API tests use it, but none existed. Worked on it: added route tests covering authorization, scoping and error codes.
5. **Smaller issues, not worked on:** README lists a `lint` script and ESLint that don't exist; malformed JSON bodies return 500 instead of 400; the task list flashes "Loading tasks…" after completing a task (the whole list is replaced while it reloads).

## What you changed

- `overdueTasksQuery` now accepts `repId`. The engine also passes the caller's raw `repId` to scope resolution, so a query definition that forgets to list it in `accepts` can no longer skip the visibility check.
- Added `canAccessTask(scope, task)` next to the scope resolver. `completeTask` uses it instead of its own team check, so reads and writes share one rule: managers by team, reps by assignee.
- Added `taskRoutes.test.ts` (10 HTTP tests) and `scope.test.ts`, which asserts for every fixture user and task that `canAccessTask` agrees with what the list query returns. This guards against the read and write rules drifting apart again.

Two commits, one per bug, each with its tests.

## What you decided not to do

- The smaller issues in item 5 above. They are real but low impact next to an authorization bug and a broken core view, and the timebox is short.
- A larger refactor to make the repository answer access questions (`findTasks` by scope plus id). It would reshape the repository interface for little gain here; a single pure function gives the same guarantee.
- Changing the web app. Both bugs are API-side; the UI already sends the right requests and displays the API's flags.
- Assumption: where the docs and README disagree with the code (for example the `lint` script), I treated the docs and the domain rules as the intended behavior.

## Verification

- Baseline before changes: 17 tests passing, `tsc` clean.
- Reproduced both bugs against the real app with a throwaway script (not committed) before touching code. Controls confirmed correct behavior elsewhere (`/api/tasks?repId=` already returned 403; other-team completion already returned 404).
- Wrote the route tests first. Four failed on exactly the two bugs; the rest passed as controls.
- After the fixes: 28 tests passing, `tsc` clean.
- Not yet checked by hand in the browser after the fixes; verification of the UI behavior is through the API tests only.

## Working with AI

I set rules at the start: the AI does not edit without my approval, it checks the architecture behind a bug before fixing it, commits stay small, and replies stay short. I had it read all docs and source and run the baseline before proposing anything, then reproduce each bug before fixing.

Example of a suggestion I directed: my rule to check the architecture before fixing a bug turned a one-line `accepts` fix into two findings: filters were silently stripped in front of a security check, and write access used a separate rule from read access. The AI laid out three options for bug 2 (minimal one-line fix, a shared `canAccessTask`, or a repository-level change); I chose the shared function.

Example of a verified and gated suggestion: to keep the first commit green, the AI wanted to mark the bug 2 test `it.skip`. The tool's auto-mode classifier blocked the edit as a security-test removal. The AI stopped and asked me instead of working around it; I approved it for that one commit only, and the test was unskipped in the next commit. Both fixes are in a git history that shows the skip and its removal.
