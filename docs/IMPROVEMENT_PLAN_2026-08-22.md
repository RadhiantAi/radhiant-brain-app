# Improvement plan: tier boundary and real identities

Classification: Internal
Date: Saturday 22 August 2026
Owner: Anith Chacko (needs confirmation)

Two improvements from the 22 August 2026 platform review are deliberately **not**
built in the accompanying pull request, because half-building either one leaves
the app worse than it is now. This is the staged plan for both, plus the one
retrieval item that was scoped out.

Everything shipped alongside this document (knowledge freshness, login limiter
header precedence, chat limits and budget, answer instrumentation, retrieval
items (a) and (b), toolchain and CI baseline) is in the pull request itself.

---

## Where the app stands today

Two facts govern the sequencing, and they compound:

1. **The git repo has no tier boundary.** `README.md` says it plainly: every
   repo reader is CEO-tier. Runtime enforcement is sound (`src/lib/knowledge.ts`
   gates every accessor through `canSee`, `src/lib/search.ts` builds one index
   per role from pre-filtered chunks, and `tests/tier-access.test.ts` proves it),
   but it enforces over a corpus that every collaborator, CI job, clone and zip
   already holds in full.
2. **Access is three shared strings.** `src/lib/auth.ts` maps three passcodes to
   three tiers, and the session `name` is whatever the person typed at login.
   There is no per-person access, no per-person revocation, and no audit trail
   worth the name.

So the CEO tier is currently guarded by a shared string, over content that is
already readable by anyone with repo access. Fixing one without the other moves
very little.

## Interim posture, effective immediately

**Until real identities land, the deployed app should serve the team tier only.**

That is a deployment decision rather than a code change: do not distribute the
leadership or CEO passcodes, and treat `RB_LEADERSHIP_PASSCODE` and
`RB_CEO_PASSCODE` as set-but-unissued. The shared-passcode model then never
guards material that matters, and the rollout can proceed on the team corpus
while stages 1 and 2 below are built.

---

## Stage 1: move the two sensitive documents out of git (small, do first)

The report's interim step, and the cheapest meaningful reduction in exposure.

**Scope:** `knowledge/ceo-context.md` and `knowledge/finance-snapshot.md` only.
Between them they hold group revenue, margins, per-lender debt service, the
cash-position note, the named potential equity partner and deal posture, and the
CEO's personal capacity and financing context. The other fourteen entries stay
in git.

**Steps**

1. Introduce the async content-loader interface described in stage 2 first, even
   though only the filesystem implementation exists at this point. Doing the
   interface before the first out-of-git document means the second loader is a
   drop-in rather than a second migration.
2. Move both files into a deploy-time environment-mounted source:
   - Vercel: two environment variables holding base64 of the markdown
     (`RB_CONTENT_CEO_CONTEXT`, `RB_CONTENT_FINANCE_SNAPSHOT`), read at request
     time. Environment variables are per-project and per-environment, so a repo
     reader gains nothing from the clone.
   - EC2/Docker (GO-LIVE Option B): a mounted file outside the repo, path given
     by `RB_CONTENT_DIR`, `0400` and owned by the service user.
3. Delete both files from git **and** rewrite them out of history, or accept that
   history retains them and rotate nothing (they are content, not credentials,
   so there is no rotation, only exposure that cannot be recalled). Decide
   explicitly and record the decision here.
4. Add a validator check that every configured out-of-git entry carries the same
   governance front-matter as the in-git ones, so the freshness workflow does not
   develop a blind spot exactly where the sensitive content lives.
5. Add a test asserting the app still fails closed when an out-of-git entry is
   configured but unreadable: a missing CEO document must produce no entry, never
   a fallback to a lower tier or an unfiltered read.

**Effort:** S. **Exit condition:** a fresh clone of the repo contains no
leadership- or CEO-tier financial content, and `npm test` still proves the tier
boundary.

## Stage 2: the async content-loader interface

The prerequisite for the real fix, and the thing that keeps local development
pleasant.

**Steps**

1. Define the interface in `src/lib/content-source.ts`:

   ```ts
   export interface ContentSource {
     list(): Promise<{ slug: string; tier: Role }[]>;
     read(slug: string, tier: Role): Promise<string | null>;
     signature(): Promise<string>;   // cache invalidation, as knowledgeSignature() does today
   }
   ```

2. Implement `FilesystemContentSource` over `knowledge/`, which is exactly the
   code in `src/lib/knowledge.ts` today wrapped in promises. **This stays as the
   local-dev path, permanently.** Working on the app must not require a blob
   credential.
3. Select the implementation by environment, defaulting to filesystem, and fail
   closed if a production environment selects the remote source and cannot reach
   it. Serving fewer entries is acceptable; serving unfiltered entries is not.
4. Make `getDocs`, `getDoc`, `getChunks` and `searchKnowledge` async. This
   touches every page, which is why it is its own stage: the pages are already
   `async` server components, so the change is mechanical, and
   `tests/tier-access.test.ts` guards it throughout.
5. Keep the per-role search index, keyed by role and content signature as now.
   The index must be built from what the loader returned for that role, never
   filtered after the fact.

**Effort:** M. **Risk:** the refactor is broad but shallow. Do it in one pass
with the test suite green at every commit.

## Stage 3: tier-prefixed private object storage

**Steps**

1. Create a private store with a prefix per tier: `brain/team/`,
   `brain/leadership/`, `brain/ceo/`. anith-hub's `lib/blob.js` is the working
   reference implementation in this estate for private, credential-gated,
   read-verified blob access, including the visibility check that refuses to
   serve a record whose privacy cannot be confirmed.
2. Implement `BlobContentSource` against that interface. The critical property:
   **a request from a team session must never fetch a leadership or CEO key**.
   The prefix is derived from the verified session role before any read, so a
   process serving a team request never holds leadership bytes in memory. That is
   the difference between this and today's model, where the bytes are always
   present and the filter is in front of them.
3. Publish content with a small script that reads the authored markdown and
   writes it under the right prefix, keyed off the `audience` front-matter field.
   Refuse to publish an entry whose audience is not exactly one of the three
   tiers, matching the fail-closed rule in `src/lib/knowledge.ts`.
4. Extend `tests/tier-access.test.ts` with a fake content source that records
   every key requested, and assert that a team-role request never asks for a
   `brain/leadership/` or `brain/ceo/` key. The current test proves filtering;
   this proves non-fetching, which is the stronger claim.
5. Retire the in-git `knowledge/` directory as the production source once the
   ingestion pipeline's export/import seam exists (see the cross-repo
   recommendation), keeping it as fixture content for local development and CI.

**Effort:** L. **Impact:** High. This is the item that makes the tier model real
rather than conditional on repository permissions staying narrow forever.

## Stage 4: Entra ID OIDC identities

Sequenced after stage 3 because a per-person identity is worth most when it gates
a content plane that actually separates tiers. It can be started in parallel; it
must not ship before stage 1.

**Steps**

1. Add the OIDC authorisation-code flow with PKCE against Entra ID. The env slots
   already exist (`ENTRA_CLIENT_ID` is reported in `src/lib/config.ts`).
2. Derive the tier from **group membership**, not from an email allowlist and not
   from anything the user can assert. Three groups map to the three tiers, and an
   authenticated user in none of them gets the team tier or no access, decided
   explicitly and recorded here.
3. Keep the existing HMAC session format. Only the issuing step changes, so
   `middleware.ts` and every route keep working. Put the Entra object id in the
   session so the name shown is verified rather than typed.
4. **Delete `passcodeRole` entirely.** Not a fallback, not behind a flag: a
   fallback shared passcode is the whole weakness, so it has to go with the
   change rather than after it. `RB_TEAM_PASSCODE`, `RB_LEADERSHIP_PASSCODE` and
   `RB_CEO_PASSCODE` come out of `.env.example`, `src/lib/config.ts` and the
   fail-closed required-env list in the same commit.
5. Add per-session revocation. Sessions are stateless HMAC tokens today, so the
   only kill switch is rotating `RB_SESSION_SECRET`, which logs everyone out.
   anith-hub's `lib/session.js` keeps a server-side record plus a revocation
   marker checked on every read; that pattern is the reference. This becomes
   straightforward once stage 3 gives the app a durable store.
6. Move the login and chat limiters into that same store, which removes the
   process-local caveat in `src/lib/rate-limit.ts` and the WAF dependency
   documented in `GO-LIVE.md`.

**Effort:** M for the flow, plus whatever the Entra app registration takes.
**Exit condition:** no shared secret grants a tier, and revoking one person's
access does not disturb anyone else's session.

---

## Scoped out of the current pull request: hybrid retrieval

Retrieval items (a) previous-turn query building and (b) sentence-boundary
chunking with overlap are implemented. Item (c) is not, deliberately, because it
should be measured against (a) and (b) rather than stacked on top of them
unmeasured.

**(c) A lightweight hybrid or synonym step.** MiniSearch is lexical with
`prefix: true, fuzzy: 0.2`, which handles typos and not synonyms: "cash position"
will not retrieve a section that says "bank balance". Two options, cheapest
first:

1. **Hand-maintained synonym map**, seeded from `src/data/glossary.json`, which
   already encodes the internal vocabulary. Expand the query with mapped terms
   before searching, keeping the original terms weighted higher. Zero new
   dependencies, no network call in the request path, and it fits this corpus
   (sixteen documents, a stable internal vocabulary).
2. **Embeddings over the same chunks**, computed at build time and searched by
   cosine similarity in process, blended with the MiniSearch score. Better
   recall, but it adds an embedding call to the build, a vector blob to ship, and
   a second thing to keep in sync with the corpus.

**Measure first.** The instrumentation shipped in this pull request records
hit count, top score and zero-hit rate per request with no message body. Two to
four weeks of that, read alongside the zero-hit list, says whether retrieval is
actually the constraint or whether the constraint is content coverage. On a
corpus this small the answer is quite likely content, and adding embeddings would
have hidden that.

## Sequencing summary

| Stage | Work | Effort | Blocks |
| --- | --- | --- | --- |
| 0 | Serve the team tier only in the deployed app | none (deployment decision) | nothing |
| 1 | `ceo-context.md` and `finance-snapshot.md` out of git | S | nothing |
| 2 | Async content-loader interface, filesystem stays for local dev | M | stage 3 |
| 3 | Tier-prefixed private object storage | L | full leadership/CEO rollout |
| 4 | Entra ID OIDC, delete `passcodeRole`, per-session revocation | M | full leadership/CEO rollout |
| later | Hybrid or synonym retrieval, once there is data to justify it | M | nothing |
