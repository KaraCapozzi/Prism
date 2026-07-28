# CLAUDE.md — Prism (working name; rename freely)

## What this is
Prism is a multimodal AI-output **quality console**, built as a portfolio piece for
a Meta **Product Content Engineer** interview on the **Instagram Edits** team.

A user brings in a generated asset (image first) by upload, paste-URL, or on-demand
generation. Prism evaluates it with a panel of four vision-capable judge models,
shows a deterministic consensus score plus where the judges disagree, and outputs a
root-cause failure taxonomy with one concrete fix.

Standalone tool. Inspired by an earlier multi-model tool (Raffina), but its own product.

## The interview story this serves
"A quality console an Edits PCE would use to evaluate **Muse Image / Muse Video**
outputs — using Meta's own **Muse Spark 1.1** as one evaluator, cross-checked
against Claude, GPT, and Gemini." The rubric targets Muse's known weak spots
(edit precision, identity preservation, scene-state consistency).

## Stack (LOCKED — do not change without asking me)
- Next.js (App Router) + TypeScript (strict)
- Tailwind CSS
- Model calls ONLY in server-side API routes (`app/api/*`). Never call a provider
  from a client component. Never expose a key to the browser.
- Deploy target: Vercel (free Hobby tier is fine for the demo)
- No database in v1. Run history lives in localStorage only.

## Environment variables (server-side only)
Create `.env.local` (add to `.gitignore`, never commit):
```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
META_API_KEY=        # Meta Model API (Muse Spark). US-developer public preview.
```
If a key is missing, that judge/generator degrades gracefully with a clear on-screen
message. It must never crash the app or block the rest of the panel.

## Judge panel (v1) — all four score ALL six rubric dimensions
Verify model IDs against provider docs before shipping; they drift.

| Judge | Model ID | Why it's here |
|---|---|---|
| Muse Spark 1.1 | `muse-spark-1.1` (CONFIRM exact ID + base URL at Meta Model API docs — it's OpenAI-compatible) | Meta-native evaluator; the interview relevance |
| Claude Opus 4.8 | `claude-opus-4-8` | Nuanced, calibrated rationales |
| GPT-5.6 | `gpt-5.6` (use **Terra** tier for judging; Sol is overkill) | Instruction-following reasoning |
| Gemini 3.1 Pro | `gemini-3.1-pro` | Fine visual-detail; cheapest frontier judge |

Each judge returns structured JSON: for each of the six dimensions, a 0–100 score
plus a one-sentence rationale. Judges run in parallel.

## Consensus + dissent (deterministic — do NOT let an LLM invent the number)
- Per dimension: consensus score = **median** of the four judge scores.
- Dissent magnitude = **standard deviation** across judges for that dimension.
- Flag any dimension where spread > 15 points as **contested**.
- For contested dimensions only, call **`claude-sonnet-5`** to write a short note:
  where the judges diverged and which view is better supported. This LLM step
  NARRATES; it never computes the score.

## Rubric (six dimensions, 0–100) — tuned to Edits / Muse
1. Prompt / instruction adherence
2. Edit precision (localized edits don't bleed into other regions)
3. Identity preservation (subjects stay consistent — Muse can pull real IG photos)
4. Visual quality / artifacts
5. Text rendering (legible in-image text, infographics)
6. Safety & consent (real-person likeness use)

## Root-cause taxonomy
Map failures to: artifact bleed · prompt drift (omission) · edit-bleed ·
identity drift · typography · safety. Output the dominant category + ONE concrete
prompt-level or edit-level fix.

## Asset input
- **Upload / paste-URL** (primary). Muse Image / Muse Video outputs come in this way —
  Muse Image has NO public API, so generate them in the Meta AI app (free) and upload.
- **Generate** (secondary, for comparison demos), behind server routes:
  - OpenAI: `gpt-image-2`
  - Google Nano Banana Pro: `gemini-3-pro-image`

## UI direction
Dark console aesthetic: near-black background, zinc neutrals, indigo accent, rose
for fail, emerald for pass, amber for warning/contested. Three columns — run context
(left), asset hero with annotation overlays (center), evaluation engine (right).
lucide-react icons. Dense, precise, product-grade.

## Build order (do ONE milestone, confirm with me, then the next)
1. Scaffold Next.js + TS + Tailwind. Static three-column shell.        ← no keys
2. Asset input: upload + paste-URL working, rendered in center pane.    ← no keys
3. One server route calling ONE judge (Claude) end to end, real score.  ← needs Anthropic key
4. Add the other three judges (parallel) + deterministic consensus + contested flags.
5. Sonnet 5 dissent narrator + root-cause taxonomy + fix recommendation.
6. Generation path (gpt-image-2 / Nano Banana Pro).
7. Run history (localStorage), polish, deploy to Vercel.

## Cost posture: Balanced (~$60 total)
Mostly the Claude Code subscription, not tokens. One eval run ≈ $0.10.
Levers to respect while building:
- Milestones 1–2 use mock judge data — $0 in API until the UI works.
- Cache the rubric/system prompt (identical every run) — ~90% off repeated input.
- Judge with GPT-5.6 Terra, not Sol.
- Muse Image outputs are FREE via the Meta AI app — never pay to generate the
  asset you're showcasing.

## Guardrails
- Server-side keys only. Always.
- Consensus scoring is deterministic code. The LLM (Sonnet 5) only writes narrative.
- **Muse Spark is a preview, US-only API.** Pre-run and cache at least one demo
  evaluation so a rate-limit mid-interview can't sink the demo. Graceful fallback
  if it errors — the other three judges still produce a result.
- TypeScript strict. Define real types for judge responses — no `any`.
- Wrap every provider call in try/catch with a visible error state.
- Ask me before adding a database, auth, or a fifth model.
- Re-confirm current model IDs against provider docs at build time; tell me if any changed.
