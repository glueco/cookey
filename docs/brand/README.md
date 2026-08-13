# Cookey brand

Two marks, one system. Both are drawn in a single color so they survive any
theme or accent swap.

## The custody C — official mark

A heavy C holding a small square in its opening: the key, held but not
handed over. Use it anywhere Cookey-the-project is meant: documentation,
the landing page, the favicon, social cards.

| File | Use |
|---|---|
| [`cookey-monogram.svg`](cookey-monogram.svg) | Theme-adaptive (ink on light, paper on dark via `prefers-color-scheme`). Default choice. |
| [`cookey-monogram-light.svg`](cookey-monogram-light.svg) | Fixed ink `#23221E`, for light backgrounds and GitHub `<picture>` light source. |
| [`cookey-monogram-dark.svg`](cookey-monogram-dark.svg) | Fixed paper `#E8E6DD`, for dark backgrounds and GitHub `<picture>` dark source. |

The mark is mirrored in code — keep all three in lockstep:

- `apps/proxy/src/app/icon.svg` — the favicon (what you see in the browser tab)
- `apps/proxy/src/components/CookeyLogo.tsx` — `CookeyMonogram`

## The bracket slot — per-deployment mark

`[x_]` — square brackets holding the deployment's own initial plus a cursor
square. Every self-hosted gateway renders its **owner's** letter, so each
install wears its own mark; it works with any glyph, Latin or not. This mark
is parametric and lives only in code: `CookeyMark` in
`apps/proxy/src/components/CookeyLogo.tsx`.

## Rules

- One color, always `currentColor` (or the fixed ink/paper values above).
  The marks never carry a hue of their own.
- Don't add gradients, shadows, outlines, or containers.
- Ink `#23221E` on light, paper `#E8E6DD` on dark.
- Minimum size 16 px — both marks are drawn to survive favicon scale.
