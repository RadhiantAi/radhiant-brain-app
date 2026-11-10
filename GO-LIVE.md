# Radhiant Brain: go-live guide

Confidentiality: Internal

Everything code-side is done. These are the steps only you (or Damon) can do, in order. A lower-tier model can drive this from here; each step says exactly what to provide.

## Step 1: Claude API key (switches on AI answers)

1. Go to https://console.anthropic.com and sign in (or create the org account).
2. Settings → API keys → Create key. Name it `radhiant-brain-prod`.
3. Put it in `.env.local` (local) or the host's environment settings (production) as `ANTHROPIC_API_KEY`.
4. Optional: set a monthly spend limit in the console (R2,000/month equivalent is a sensible start for a small team).

Until this is done the app works in knowledge-search mode, so you can demo it immediately.

## Step 2: Session secret and passcodes

The app **fails closed**: it will not run until all four of these are set to real, non-placeholder values, in dev or in production. There are no built-in defaults.

1. Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Set `RB_SESSION_SECRET` to that value.
3. Choose three **long, random** passcodes (not guessable words) and set `RB_TEAM_PASSCODE`, `RB_LEADERSHIP_PASSCODE`, `RB_CEO_PASSCODE`. Share each only with the right group (team-wide, the heads + fractional advisors, and you alone). A passphrase generator or `openssl rand -base64 18` is fine. Login is rate-limited (per-IP throttle with a short lockout) but short human-chosen passcodes are still the weak link, so make them long.

> **ROTATE (required, human action):** earlier repo history contained placeholder-activated dev defaults for `RB_SESSION_SECRET` and all three passcodes. Treat those strings as burned. Set fresh values here and never reuse the old ones. If the app was ever run publicly with the placeholder secret active, rotate `RB_SESSION_SECRET` again after go-live.

### Step 2a: WAF rate rule on the login endpoint (required on Vercel)

The login throttle in `src/lib/rate-limit.ts` is **process-local**. On a single
container behind Nginx (Option B below) that is a real ceiling. On Vercel it is
one bucket per warm function instance, so it blunts brute force rather than
stopping it, and the app cannot fix that on its own.

The client key now prefers `x-real-ip` (the platform-set connection IP) over
`x-forwarded-for` (which the client can append to), so a rotating header no
longer mints a fresh bucket per request. That closes the bypass. It does not make
a per-instance counter global.

**If you deploy on Vercel, add an edge rate rule before sharing the link:**

1. Vercel project → Firewall → Rate Limiting → Add rule.
2. Path: `/api/auth/login`. Method: `POST`.
3. Limit: 20 requests per minute per IP, action: deny for 10 minutes.
4. Save and deploy the firewall configuration.

Without that rule the eight-failure lockout is per instance, so the effective
limit against a distributed attacker is eight multiplied by however many
instances are warm. The durable fix (a shared counter in the storage plane) is
stage 4 in `docs/IMPROVEMENT_PLAN_2026-08-22.md`.

The chat endpoint carries its own per-session burst limit and per-tier daily cap
(`src/lib/chat-limits.ts`), with the same process-local caveat. Because the
per-session cap is keyed on the name typed at sign-in, an app-wide daily ceiling
sits behind it (default 400 questions a day across everyone, set with
`RB_DAILY_CHAT_CEILING`). Set a monthly
spend limit in the Anthropic console as the outer ceiling regardless.

### Session kill switch

Sessions are stateless HMAC tokens valid for 14 days; there is no per-session revocation. If a passcode leaks:

1. Change the affected passcode (stops new sign-ins).
2. Rotate `RB_SESSION_SECRET` to invalidate **every** existing session immediately (this logs everyone out; it is the only kill switch). Rotating just the passcode does not end sessions already minted from it.

## Step 3: Hosting

Pick one; both work as-is:

> **Repo privacy (required, human action):** keep `RadhiantAi/radhiant-brain-app` **private**. The `knowledge/` folder holds team-tier entries only, as ruled on 10 November 2026; leadership- and CEO-tier content must not be added to git, because every repo reader can read every knowledge file.

**Option A: Vercel (fastest)**
1. Push the repo to GitHub as `RadhiantAi/radhiant-brain-app` (keep it private).
2. vercel.com → New Project → import the repo. Framework auto-detects.
3. Add the five environment variables from steps 1 and 2 in Project → Settings → Environment Variables.
4. Deploy.

**Option B: Same pattern as the Admin Portal (EC2 + Docker or Node)**
1. `npm run build` then `npm run start` behind Nginx with a Let's Encrypt certificate, the same shape Damon runs for the portal.

## Step 4: Domain

1. Decide the subdomain. Suggestion: `brain.radhiant.cloud` (internal tool, so the .cloud zone fits the Hub pattern; `brain.rdisa.co.za` also works if you want it next to the portal).
2. Add a CNAME for it pointing at the host (Vercel gives you the target; for EC2, an A record to the instance IP).
3. On Vercel: Project → Settings → Domains → add the subdomain.

## Step 5: First content review (30 minutes, you)

1. Sign in with the CEO passcode and read every entry in Knowledge, especially the three leadership entries and the CEO entry.
2. Anything marked "needs confirmation" (screen count, revenue per mammogram, FY26 targets, the CFO arrangement, Tanya Hanekom's role): correct or confirm it in the markdown files.
3. Delete or edit anything you don't want at its current tier. The audience field on each file is the control.
4. **Confirm the freshness governance on every entry.** Each file now carries `owner`, `approvedBy`, `lastReviewedAt`, `review_by` and `reviewStatus`. Every one of the sixteen was seeded with `owner: Anith Chacko`, `approvedBy: Anith Chacko` and `reviewStatus: pending-owner-confirmation`, which is a placeholder, not a decision. Reassign the ones that belong to somebody else, set a `review_by` that matches how fast each entry actually moves, and change `reviewStatus` to `approved` once you have read it. The seeded review dates are 90 days from the last review for Internal entries and 60 days for Confidential ones.
5. Note that `npm run validate:knowledge` (and therefore CI and `npm run build`) fails as soon as any entry is unapproved or past its `review_by` date, with no grace period. That is the point: a stale corpus becomes a red build rather than a confidently-cited wrong answer.

## Step 6: Team rollout

1. Share the app link + team passcode in the Monday L10.
2. House rule to state out loud once: no patient information in the app, ever.
3. Nominate one owner per category (suggestion: Sam for Ways of working, Damon for Systems, Kim for Operations) to send you corrections.

## Later, planned

`docs/IMPROVEMENT_PLAN_2026-08-22.md` holds the staged plan. Headlines:

- **Interim posture: serve the team tier only.** Until real identities land, do not distribute the leadership or CEO passcodes. The shared-passcode model then never guards material that matters.
- **Move `ceo-context.md` and `finance-snapshot.md` out of git** into deploy-time environment-mounted files (stage 1, small). That removes the two genuinely sensitive documents from every clone while the rest stays as is.
- **Microsoft Entra ID SSO** to replace passcodes with Microsoft 365 sign-in, with the tier derived from group membership and `passcodeRole` deleted rather than kept as a fallback.
- **Wire to the governed Brain repo**: when the spec V0.6 Phase 0 repo exists, generate `knowledge/` from its portal-export instead of editing by hand. The front-matter already uses that contract's field names.

## Usage logging (already on)

Every chat request now writes one aggregate JSON line to the server log: access tier, mode, hit count, top score, stale hit count and the doc slugs retrieved, plus a token-usage line per AI answer. **No question text, no answer text and no personal name is stored.** Read the zero-hit lines weekly during rollout; that list is the content backlog.

## What I never did (deliberately)

- No secrets are in the repo; every sensitive value is a placeholder.
- No patient data, and no personal data beyond business roles and work emails already in team-wide use.
- Nothing was pushed to GitHub or deployed anywhere; the app exists only in this folder until you run step 3.
