# Apple Card Hover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add restrained Apple-style hover feedback to the project's major light and dark cards.

**Architecture:** Reuse the existing `card-lift` utility as the shared motion contract and add light and gold variants through CSS custom properties. Attach those classes only to actual repeated or functional card surfaces, leaving page sections and controls unchanged.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, global CSS

---

### Task 1: Define the motion contract

**Files:**
- Create: `scripts/test-card-hover.mjs`
- Modify: `package.json`
- Modify: `app/globals.css`

- [ ] Add a source contract test for 240ms transitions, the approved easing curve, `translateY(-2px) scale(1.01)`, light/dark border variables, hover-capable pointer media query, and no rotate animation.
- [ ] Run `npm.cmd run test:card-hover` and confirm it fails before the CSS contract exists.
- [ ] Replace the current generic `card-lift` transition with explicit transform, shadow, border and background transitions, then add `card-lift-light` and `card-lift-gold` variables.
- [ ] Run `npm.cmd run test:card-hover` and confirm it passes.

### Task 2: Attach the utility to major cards

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/worldcup/hot-topic-radar-panel.tsx`
- Modify: `components/worldcup/insight-charts.tsx`
- Modify: `app/matches/[id]/page.tsx`
- Modify: `app/hot-topics/[id]/page.tsx`
- Modify: `app/settings/page.tsx`
- Modify: `components/ui/card.tsx`
- Modify: `components/generate/generator-panel.tsx`
- Modify: `app/topic-engine/page.tsx`
- Modify: `app/risk-review/page.tsx`

- [ ] Extend the source contract test to require the light utility on the main light cards and the dark utility on shared/dark cards.
- [ ] Run the test and confirm it fails on missing class attachments.
- [ ] Add `card-lift-light` to light repeated cards, `card-lift-gold` to emphasized cards, and keep shared dark `Card` on `card-lift`.
- [ ] Remove stronger legacy card hover transforms such as `hover:-translate-y-1` where they conflict with the shared motion contract.

### Task 3: Verify

**Files:**
- Test: `scripts/test-card-hover.mjs`

- [ ] Run `npm.cmd run test:card-hover`.
- [ ] Run existing workflow regression tests.
- [ ] Run `npm.cmd run build`.
- [ ] Confirm `.next-dev-3022.log` and `product-design-audit/` remain untracked.
- [ ] Commit and push the same commit to `origin/main` and `vercelrepo/main`.
