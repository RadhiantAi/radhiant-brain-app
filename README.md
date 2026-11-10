> Release preparation: see [the 9 November 2026 review](docs/RELEASE_REVIEW_2026-11-09.md). This branch is not approved for staff rollout. Default builds block unapproved knowledge.

# Radhiant Brain

Confidentiality: Internal

The staff-facing knowledge assistant for Radhiant Group. It answers questions about the company (people, meetings, systems, SOPs, strategy) from a curated markdown knowledge base, with an AI chat layer powered by the Claude API.

## What's inside

- **Ask the Brain** (`/chat`): chat assistant. With an Anthropic API key it streams grounded answers that cite knowledge entries; without one it runs in knowledge-search mode.
- **Knowledge** (`/knowledge`): browsable, searchable entries with audience tier, sensitivity, currentness and sources on each.
- **People, Systems, Glossary**: the directory, the systems map, and the decoder ring.
- **Admin** (`/admin`): environment checklist, knowledge inventory, update instructions. Leadership and CEO access only.

## Access tiers

Three passcodes map to three tiers: `team` < `leadership` < `ceo`. Knowledge entries carry an `audience` field and are filtered everywhere (browsing, search, and the chat retrieval pipeline) so a team user's question never touches leadership or CEO content.

## Relationship to the Radhiant Brain spec V0.6

This app is the **assistant surface**, a derived read model in the language of `20260628_CEO_RadhiantBrainImplementationSpec_SPEC_V0.6.md`. The `knowledge/` folder plays the role of an approved, portal-safe knowledge pack. The governed Brain repo (registers, source lanes, scan rules, restricted candidate store) remains the authority for what gets published here. No personal data and no patient-level data belong in `knowledge/`, ever.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in real values (see below)
npm run dev                  # http://localhost:3040
```

The app **fails closed**: there are no built-in passcodes or session secret. It refuses to start (in every environment) until `RB_SESSION_SECRET` and all three passcodes are set to real, non-placeholder values. This is deliberate: a committed credential would let anyone who reads the repo forge a CEO session.

Generate a session secret and choose passcodes:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # RB_SESSION_SECRET
```

## Configure

Copy `.env.example` to `.env.local` and fill in real values. See `GO-LIVE.md` for the exact step-by-step path to production.

## Security

This repository is not a public artefact. Read it as confidential:

- **Keep the repo private and restrict collaborators.** The `knowledge/` folder holds `team`-tier entries only, as ruled on 10 November 2026. The app enforces tiers at runtime, but **the git repo has no tier boundary**: anyone with read access to the repo can read every knowledge file. Leadership- and CEO-tier content must therefore stay out of git.
- **Never reuse the credentials that were once committed.** Earlier history contained placeholder-activated dev defaults for the session secret and passcodes. Those strings are burned; set fresh values in the deployment environment only.
- **If higher tiers are ever needed:** keep that content in deploy-time-only storage (a private blob or env-mounted file) or in a separate private content repo with tighter access than the app repo.
- The tier filtering in code is server-side everywhere and covered by a test (`tests/tier-access.test.ts`) that asserts a team session cannot reach CEO content through the app.

## Update knowledge

Add or edit markdown files in `knowledge/`. Redeploy (or just save, in dev) and both browsing and chat pick the change up.

Front-matter fields:

| Field | Required | Notes |
| --- | --- | --- |
| `title` | yes | |
| `category` | yes | groups the entry on `/knowledge` |
| `audience` | yes | `team` / `leadership` / `ceo`. This is the access-control boundary. |
| `sensitivity` | yes | `Public` / `Internal` / `Confidential` |
| `currentness` | yes | `current` / `historical` / `draft` |
| `updated` | yes | absolute `YYYY-MM-DD`, when the text last changed |
| `lastReviewedAt` | yes | absolute `YYYY-MM-DD`, when the owner last checked it is still true |
| `owner` | no | the person who answers for this entry being right; shown when present |
| `review_by` | yes | absolute `YYYY-MM-DD`, when it must be re-reviewed |
| `approvedBy` | yes | who approved it |
| `reviewStatus` | no | `approved` / `pending-owner-confirmation` / `in-review` / `draft` |
| `expiryAction` | no | `review` / `archive` / `retire` |
| `summary` | yes | shown on the card |
| `sources` | no | references and links to the source documents; shown when present |

Field names follow the ingestion pipeline's portal export contract (`radhiant-brain-company-knowledge-ingestion`, `05_PORTAL_EXPORT/PORTAL_EXPORT_CONTRACT.md`) so the importer, when it exists, has nothing to translate. `review_by` is that contract's `expiresAt` paired with `expiryAction: review`, kept under a plainer name here.

### Freshness is a workflow, not a field

Age is enforced in three places rather than merely recorded:

- **The release gate fails** when any entry is unapproved, withdrawn, not current or past its `review_by` date (`npm run validate:knowledge`, which `npm run build` runs first). There is no grace period and no build override: approval and dates come from the governed source.
- **The UI shows age** on every knowledge card and doc page, with a caution banner naming the owner once an entry passes 60 days.
- **Retrieval carries age into the answer.** Each context entry reaches the model as `[Entry: … | Section: … | Last reviewed: YYYY-MM-DD]`, marked `STALE` past 60 days, and the system prompt requires a stale entry to be cited with its date and a caution. Stale content then degrades honestly instead of silently.

## Limits and instrumentation

- **Login** is throttled per client (eight failures in fifteen minutes, then a five-minute lockout). The client key prefers `x-real-ip` over `x-forwarded-for`, because the latter is client-appendable and reading it first would hand an attacker a fresh bucket per request. See `src/lib/client-ip.ts` and the WAF note in `GO-LIVE.md`.
- **Chat** is limited per session: 12 requests a minute, and a daily message cap per tier (team 60, leadership 150, CEO 400), resetting at midnight SAST. The session is keyed on the name typed at sign-in, so an app-wide daily ceiling (default 400, `RB_DAILY_CHAT_CEILING`) bounds the total whatever names are used. See `src/lib/chat-limits.ts`.
- **Every chat request logs one aggregate line**: tier, mode, hit count, top score, stale hit count, and the doc slugs retrieved. Token usage from the SDK's final message is logged and accumulated per month so spend is knowable from this side. **No message text, no answer text and no personal name is recorded anywhere.** The zero-hit count is the content backlog; read it weekly during rollout.

## Planned work

`docs/IMPROVEMENT_PLAN_2026-08-22.md` holds the staged plan for the two large items: moving the tier boundary to the storage plane, and replacing the three shared passcodes with Entra ID identities. It also records the interim posture: **until real identities land, the deployed app should serve the team tier only.**

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · @anthropic-ai/sdk · MiniSearch (local retrieval) · no database required.
