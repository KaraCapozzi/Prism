# CLAUDE.md — Prism

## What this is
Prism is a multimodal AI-output **quality console**. It evaluates a generated image
(and, in edit mode, a before/after pair) with a panel of four vision-capable judge
models, shows a deterministic consensus plus where the judges disagree, and outputs a
root-cause failure taxonomy with one concrete fix. Standalone tool; inspired by an
earlier multi-model tool (Raffina) but its own product.

## Stack (LOCKED — do not change without asking me)
- Next.js (App Router) + TypeScript (strict)
- Tailwind CSS
- Model calls ONLY in server-side API routes (`app/api/*`). Never call a provider from
  a client component. Never expose a key to the browser.
- Deploy target: Vercel. No database in v1; run history in localStorage.

## Environment variables (server-side only)
Create `.env.local` (gitignored, never committed):
```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
META_API_KEY=      # Meta Model API (Muse Spark). US-developer public preview.
```

## Judge panel (v1) — all accept image input
Verify IDs against provider docs before shipping.
| Judge | Model ID |
|---|---|
| Muse Spark 1.1 | `muse-spark-1.1` (CONFIRM exact ID + base URL at Meta Model API docs; OpenAI-compatible) |
| Claude Opus 4.8 | `claude-opus-4-8` |
| GPT-5.6 | `gpt-5.6` (Terra tier for judging) |
| Gemini 3.1 Pro | `gemini-3.1-pro` |

## Input modes (the rubric ADAPTS to what it's given)
1. **Image only** -> intrinsic quality eval.
2. **Image + prompt** -> adherence eval (intrinsic + adherence/completeness).
3. **Before image + after image + edit instruction** -> edit eval (adds edit precision +
   identity preservation).

## Rubric — dimensions activate by mode (0-100 each)
| Dimension | Needs | Active in modes |
|---|---|---|
| Visual quality / artifacts | image only | 1, 2, 3 |
| Photorealism / execution* | image only | 1, 2, 3 |
| Text rendering (auto-skip if no text) | image only | 1, 2, 3 |
| Safety & consent | image only | 1, 2, 3 |
| Prompt / instruction adherence | image + prompt | 2, 3 |
| Completeness (everything asked for is present) | image + prompt | 2, 3 |
| Edit precision (change happened, didn't bleed) | before + after + instruction | 3 |
| Identity preservation (subjects unchanged) | before + after | 3 |

*Photorealism only penalizes when realism is clearly intended. For illustration/cartoon
styles, judge stylistic execution instead — never punish a good cartoon for not being a photo.

**Critical rule:** a dimension that does NOT apply in the current mode must be OMITTED from
the result — never scored 0. A 0 would wrongly drag the average. Each judge is told which
mode is active and which dimensions to score. Consensus is computed over ACTIVE dimensions only.

## Consensus + dissent (deterministic — an LLM never invents the number)
- Per active dimension: consensus = **median** of the judge scores.
- Dissent magnitude = **standard deviation** across judges.
- Flag any dimension with spread > 15 points as **contested**.
- For contested dimensions only, call `claude-sonnet-5` to narrate where judges diverged
  and which view is better supported. This step NARRATES; it never computes a score.

## Root-cause taxonomy
Map failures to: artifact bleed · prompt drift (omission) · edit bleed · identity drift ·
typography · safety. Output the dominant category + ONE concrete fix.

## Error handling (STANDING RULE — every milestone from 3.5 on respects this)
Never show a generic failure. Every error names three things: **category, which provider or
input, and the next action.** Detect and message these distinctly:
- Missing/invalid key -> "X key missing or invalid — check .env.local"
- **Out of credit / quota** (HTTP 402, or 429 `insufficient_quota`) -> "X is out of credit —
  recharge at <link>". Must be distinguishable from a plain rate-limit.
- Rate limited (429, quota not exhausted) -> "X rate-limited — retry shortly"
- Network / timeout -> "Couldn't reach X — network or timeout"
- Model safety refusal -> "X declined to evaluate this asset (safety)"
- Malformed / unparseable response -> "X returned an unexpected format"

Comprehensive UX states, always present:
- Empty (no asset), loading (per judge, independently), partial (some judges succeeded,
  some failed — show both), input errors (bad URL, unsupported type, oversize file), global fallback.
- **Per-judge isolation:** one judge failing never blocks the others or the consensus,
  which is computed over the judges that returned.

Recharge links to surface: Anthropic console.anthropic.com · OpenAI platform.openai.com ·
Google aistudio.google.com · Meta developer.meta.com/ai.

## Build order (do ONE milestone, confirm with me, then the next)
1. [done] Static three-column shell.
2. [done] Asset input: upload + paste-URL.
3. [done] One server route calling ONE judge (Claude), real scores.
3.5. Prompt field + adaptive rubric (modes 1 & 2) on the single judge. Dimensions activate
     by mode; inactive dimensions omitted, never zeroed. Error-handling standing rule starts here.
3.6. Before/after edit mode (mode 3) on the single judge: adds edit precision + identity preservation.
4. Expand to all four judges in parallel + deterministic consensus over active dimensions + contested flags.
5. Sonnet 5 dissent narrator + root-cause taxonomy + fix.
6. Generation path (gpt-image-2 / Nano Banana Pro).
7. Run history (localStorage), polish, deploy to Vercel.

## Cost posture: Balanced (~$60). One eval run ~ $0.10.
Levers: mock during 1-2 ($0 until UI works); cache the rubric prompt (~90% off repeated input);
judge with GPT-5.6 Terra not Sol; Muse Image outputs are FREE via the Meta AI app.

## Guardrails
- Server-side keys only. Consensus scoring is deterministic code; the LLM only narrates.
- Muse Spark is a preview, US-only API: pre-cache one demo run; graceful fallback if it errors.
- TypeScript strict. Real types for judge responses — no `any`.
- Every provider call in try/catch with the categorized error states above.
- Ask me before adding a database, auth, or a fifth model.
- Re-confirm current model IDs against provider docs at build time; flag any changes.
