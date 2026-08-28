---
"@glueco/sdk": patch
---

Fix the publish workflow shipping an empty package. `1.0.0` was published without running the build first, so the tarball only contained `package.json` and `README.md` — `dist/` (what `main`/`module`/`types` all point at) never made it in, breaking the import for every consumer. The publish workflow now builds the SDK before `changeset publish`, and `prepublishOnly` does the same as a safety net for any manual publish.
