# Staff release preparation: 9 November 2026

Internal. Draft implementation for review. **Not approved for staff rollout.**

## What this branch changes

- Updates Next within version 15 and its matching lint package. Applies scoped
  overrides for PostCSS and the lint tool's minimatch dependency. The final
  audited lockfile reports no known vulnerabilities on 9 November 2026.
- Makes approval, currentness, dates, source/owner/approver, governed entry ID,
  portal visibility and withdrawal flags request-time checks. Browse, search,
  direct entry access and chat use the same eligibility policy. An expired or
  withdrawn entry cannot survive in a warm search index.
- Removes the four restricted legacy documents from the deployable knowledge
  tree: CEO context, finance, leadership strategy and technology roadmap. Their
  previous versions remain in Git history. This does not remove historical
  repository access or constitute approval to publish them somewhere else.
- Routes People and Systems through their governed knowledge entries. The old
  independent JSON files are retained as historical source material but are no
  longer imported by these pages. The glossary now contains common abbreviation
  expansions only; it no longer exposes private workstream descriptions, old
  personnel details or superseded meeting times.
- Adds concise staff instructions, practical task starters, optional clarification,
  draft assistance, a clear unknown-fact response and explicit limits on live data.
  Retrieved text is passed as untrusted reference data, outside system instructions.
- Adds labelled source references with section and review date. Only supplied IDs
  become citation links. Cited entries and related reading are distinguished.
  This checks source identity, not whether a generated claim is entailed by it.
- Adds stop, retry, copy, an editable question box while waiting, incomplete-answer
  notices and a correction-note draft. A correction note is copied for a person
  to review; it is not submitted to a queue or promoted into company knowledge.
- Adds responsive navigation and accessible input/status labels. Conversations
  stay in page memory, not browser storage. Leaving or refreshing clears them.
  This is not saved conversation history or a recovery guarantee after refresh.
- Prevents remote image loading from Markdown; chat links are limited to supplied
  internal knowledge links. Hardened malformed request/session validation and
  same-origin mutation checks.
- Adds a narrowly matched secret-scan exception for a test expression that generates
  a fresh random key in memory. Synthetic controls prove literal credentials in
  environment or code assignments still fail the scan.
- Moves middleware to `src/middleware.ts`, where Next actually includes it for
  this `src/app` project. The previous root file was absent from the built
  middleware manifest.
- Separates compilation from the knowledge release check. `build:app` is for
  engineering verification; default `build` first requires approved knowledge.
  CI runs code checks even while the separate knowledge release job remains red.

## Verified checks

| Check | Result on 9 November 2026 | Limits |
|---|---|---|
| Unit and regression suite | 63 passed | Includes synthetic tier boundaries, withdrawal after indexing, impossible dates, malformed sessions, request/stream/citation handling |
| Lint and TypeScript | Passed | Static checks |
| Next production compilation | Passed | Compilation is not deployment approval |
| npm audit, full dependency tree | 0 known findings | Registry advisory state at test time; not a security certification |
| Compiled HTTP integration | Seven groups passed | Real local Next routes and SDK against a synthetic local provider |
| Ingestion tests, separate branch | 90 tests and 40 subtests passed | Fixture/repository scope |
| Ingestion manifest | 82 entries verified after review-note addition | Includes this session's upstream review note; no business register records changed |
| Ingestion isolated dry run | 32 checks passed | No live service or real restricted-store ACL assertion |
| Knowledge release gate | Expected failure: twelve remaining legacy entries await approval | The four restricted entries were removed from this app tree; none of the original sixteen was approved |
| Browser interaction / visual review | Blocked in this environment | Local Chromium could not create its required socket; cloud browser could not reach the local test server |
| Live Claude answer quality and staff UAT | Not run | No live API key, real staff identity or approved current corpus used |

The HTTP checks prove unauthenticated and malformed requests fail, cross-origin
mutations fail, team access cannot retrieve the CEO fixture, search fallback uses
authorised content, People uses the governed entry, Unicode streams complete,
provider length limits remain incomplete, provider failures retain source metadata,
and cancelling the client closes the upstream stream. They do not prove that a
live model will always follow a prompt or that citations always support its claims.

Run from this repository with Node 24:

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run build:app
npm run test:http
npm audit
npm run validate:knowledge
```

The last command is supposed to fail against the present business content. Do not
change approval fields, review dates or the clock merely to make it pass. The
positive tests use a temporary, entirely synthetic corpus and never approve real
company information. The HTTP test creates local random test credentials and a
local mock model service, without printing or persisting those credentials.

## Remaining release work, in dependency order

1. **Reconcile the source baseline.** Recover the unpublished September commits
   `e318ac8` and `d9ed4a980213f3810bbf1895c4ff33a83a1c3837` from the local Windows
   project or a patch/bundle. The full second SHA was not found in the connected
   GitHub repository. Preserve the completed September metadata-sweep branch.
   Do not overwrite those changes or close its conflicts by guessing.
2. **Approve current knowledge.** Review the sixteen-entry correction pack in the
   ingestion branch. Resolve people, meeting, operational-minimum and subscription
   cancellation facts; assign owners and obtain approval of each whole entry.
3. **Complete the governed content contract and importer.** The present v1 export
   contains short summaries, not full document bodies. Resolve v2 claim/conflict
   work first; add approved body text or an immutable source reference plus digest.
   Test duplicate IDs, unknown roles, missing approval, withdrawal, expiry,
   unresolved blocking conflicts, source/hash mismatch and partial-write rollback.
   Keep the governed pipeline authoritative and generate the app's content.
4. **Implement individual sign-in and durable controls.** Microsoft Entra login,
   explicit tenant/group-to-role mapping, revocable server-side sessions, disabled
   user handling, shared rate/cost limits and spend alerts are still outstanding.
   The existing shared passcodes and process-local counters remain a pilot-only
   limitation. The code does not yet claim individual identity or durable caps.
5. **Complete private content and takedown.** Provision the approved private store,
   decide whether any restricted historical Git material needs removal, test role
   boundaries, revoke access, remove content from retrieval and verify the removal
   across warm instances. Agree the takedown owner and backup.
6. **Connect live figures separately.** Use each person's approved connector
   identity and callback, confirm production endpoints and metric definitions,
   apply data minimisation and must-fail patient-data tests. Failed or missing data
   must stay unavailable, not display zero. This branch has no live connector.
7. **Run browser and staff acceptance.** Test mobile/desktop, keyboard navigation,
   slow/failed streams, source links, correction notes and the task matrix below.
   Run a small authorised model evaluation with adversarial source fixtures and
   a cost cap. Real clinical/patient data is not required for these tests.
8. **Release and handover.** Bind evidence to the exact candidate commit and
   knowledge release; confirm ownership, budgets, retention, incident/takedown
   contacts, backup/restore and rollback. Then obtain the release approval and
   give Damon one concrete deployment package. No message has been sent to him.

## Proposed staff acceptance tasks

Manual acceptance remains **not run**. Automated coverage is identified without
counting it as staff acceptance.

| # | Task | Expected behaviour | Automated evidence |
|---|---|---|---|
| 1 | Find the person responsible for a task | Current approved role, source and a useful next step | Governed directory HTTP check |
| 2 | Ask with a spelling mistake | Find the intended approved entry or ask one useful question | Existing fuzzy retrieval; manual quality check needed |
| 3 | Ask a short follow-up | Carry the prior user topic without treating earlier AI text as policy | Retrieval tests |
| 4 | Draft a polite colleague follow-up | Helpful draft, no invented company policy or automatic sending | Live model review needed |
| 5 | Make a checklist | Practical steps; identify which company details need confirmation | Live model review needed |
| 6 | Find the current form or SOP | Current, authorised link; no invented URL | Manual source review needed |
| 7 | Ask a question outside the corpus | Explain the missing fact and help with unaffected parts | Empty-search HTTP and model review |
| 8 | Ask a subscription cancellation question | Avoid choosing an unresolved formula | Content approval and model review needed |
| 9 | Ask for a current operational minimum | Approved distance/timing rule or explicit gap | Content approval needed |
| 10 | Ask for today's completions | Explain live data is unavailable in this version | Live model review needed |
| 11 | Request a CEO or finance entry as staff | No content or restricted source title disclosed | Tier tests and direct-access HTTP check |
| 12 | Withdraw a previously indexed entry | It disappears from browse, search and direct access | Warm-index withdrawal test |
| 13 | Pass a review deadline overnight | Entry no longer used, including on a warm instance | SAST boundary policy test |
| 14 | Insert instructions into a source | Access boundaries hold; no tool action or external image load | Server filters; model adversarial review needed |
| 15 | Inspect a claimed citation | Supplied entry, section and review date; unknown IDs do not become links | Citation tests |
| 16 | Lose the provider or receive a partial answer | Clear incomplete state, retained question and related entries | Protocol and HTTP failure checks |
| 17 | Stop a long answer | Stops UI request and upstream generation | HTTP cancellation check; browser check pending |
| 18 | Retry, copy and start a new chat | No duplicate user turn; draft handled predictably; clear conversation | Browser check pending |
| 19 | Report a wrong or missing answer | User prepares a review note; nothing silently updates knowledge | Browser and owner workflow check pending |
| 20 | Use a phone or keyboard only | Readable layout, reachable controls, no scroll trapping | Browser/accessibility check pending |

## Rollback and review boundaries

This is a draft branch based on `bfd22035e0e11995ba462cc822bb54f4de2431cb`.
Main and the live Vercel deployment were not changed. No Entra app, group, cloud
store, payment setting, production secret, repository history or mailbox data was
changed. Do not use the old deployed version as a staff rollout fallback merely
because it is reachable: it has the approval and stale-content gaps this review
identified. A future rollback must name a tested app commit, compatible knowledge
release, environment and revocation procedure.
