# Prism

Prism looks at a picture and asks four different AI models to grade it. Then it
does the actual scoring itself, with regular math, so no single AI gets to
decide the final number. You get a score, and you get to see exactly where the
four graders disagreed.

Think of it like asking four friends to review the same essay instead of
trusting one. Some of them will agree. The interesting part is where they
don't.

## What problem this is even solving

AI image tools are good at making pictures now. Editing an existing photo —
"put my dog in a birthday hat," "swap the background," "add this caption" — is
harder to get right, and harder still to check automatically. Did the edit
actually happen? Did it stay where it was supposed to? Does the person in the
photo still look like themselves?

One AI grading its own homework isn't very convincing. So this app asks four,
takes the middle answer, and flags the spots where they can't agree.

It's built around Meta's Muse (the image model behind Instagram's editing
tools), cross-checked against Claude, GPT, and Gemini — but the same idea
works for any AI-generated image.

## The flow, roughly

```
   your image
       │
       ▼
┌──────────────────────────────┐
│   four AI judges look at it  │
│  Muse Spark · Claude · GPT   │
│         · Gemini             │
└──────────────────────────────┘
       │
       ▼
  plain arithmetic (median + spread)
       │
       ▼
  a score, plus a note on what they disagreed about
```

## The six things it checks

Every judge scores every image on the same six things, 0 to 100 each.

| Check | What it's actually asking |
|---|---|
| Prompt adherence | Did the edit do what was asked? |
| Edit precision | Did the edit stay contained, or spill into the rest of the photo? |
| Identity preservation | Does the person still look like the person? |
| Visual quality | Any warping, artifacts, or general weirdness? |
| Text rendering | Is any in-image text actually legible? |
| Safety & consent | Is a real person's likeness being used appropriately? |

## How the score is actually worked out

No AI is asked "what's the final score" — that would just be one more opinion
wearing a lab coat. Instead:

- **Consensus score** for each of the six checks = the **median** of the four
  judges' scores.
- **Disagreement** for each check = the **standard deviation** across the four
  judges.
- If that spread is more than **15 points**, the check gets flagged
  **contested** — the judges genuinely don't agree, and that's worth knowing.

Only after that plain math is done does an AI get a turn — and only to write
a sentence or two explaining *why* the judges likely disagreed on a contested
check. It narrates. It doesn't get a vote.

## The tech, briefly

| Piece | What it's for |
|---|---|
| Next.js (App Router) + TypeScript | The app itself |
| Tailwind CSS | The dark, screen-full-of-numbers look |
| Anthropic SDK | Calls Claude, server-side only |
| lucide-react | Icons |
| Vercel | Where it'll live once deployed |

No database. Run history is meant to live in your browser's local storage,
once that part is built (see below).

## Honest status

This is being built one small piece at a time, and this README won't pretend
otherwise.

**Built:**
- [x] The three-column dashboard layout — run history on the left, your image
      in the middle, the judges' scores on the right
- [x] Upload an image, or paste a link to one, and see it rendered
- [x] One real judge, live: Claude looks at your actual image and returns a
      real score and a real one-sentence reason for each of the six checks

**Planned, not built yet:**
- [ ] The other three judges (Muse Spark, GPT, Gemini) actually running —
      right now they're shown with placeholder scores
- [ ] The median/spread math running on real numbers from all four judges,
      instead of on mock data
- [ ] The AI-written note explaining contested disagreements, plus a
      root-cause tag ("this looks like edit bleed") and one concrete fix
- [ ] Generating a test image on demand, instead of only upload/paste
- [ ] Saving run history so it survives a page refresh, and deploying it
      somewhere you can actually visit

If you poke around and see four judges with tidy scores and a full report,
that's the target, not (yet) the reality. Right now, only Claude is real.

## Running it yourself

You'll need Node 18 or newer.

```bash
git clone https://github.com/KaraCapozzi/Prism.git
cd Prism
npm install
```

Create a file called `.env.local` in the project root:

```
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
META_API_KEY=
```

Only `ANTHROPIC_API_KEY` does anything right now — that's what powers the one
live judge. The other three are reserved for when their judges get wired up.
Leave them blank and the app runs fine; it just tells you that judge isn't
configured instead of falling over.

Then:

```bash
npm run dev
```

and open [http://localhost:3000](http://localhost:3000).

## Why "Prism"

Light goes in, splits into a few different views of the same thing, and you
learn something from how they differ. Also it was sitting right there.

---

Thanks for reading this far. Go find a picture with a slightly weird hand in
it and see what the judges think.
