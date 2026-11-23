# Evidence: the web dashboard (P1)

Every capture here is of the **synthetic** fixture (`packages/core/fixtures/synthetic/full.json`:
invented projects, round invented figures, `example.com` links), served by the production build
with `WATCHMAN_SNAPSHOT_DIR` unset. No real data is captured.

| File                                | What it shows                                                                            | How it was made                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `home-1440.png`, `home-390.png`     | The home view: four tiles, the data stamp and the synthetic badge                        | `EVIDENCE_DIR=evidence npm run e2e` (Playwright, installed Chrome, full page, animations finished) |
| `<view>-1440.png`, `<view>-390.png` | Each drill-down (`attention`, `flow`, `spend`, `metrics`) at desktop and phone           | the same run; the test also asserts no sideways scroll at 390 and 1440 px                          |
| `home-customised-1440.png`          | After hiding Metrics and moving Spend first by keyboard, then reloading the page         | the same run (focus is on the skip link: the first Tab after the reload)                           |
| `focus-ring-attention.png`          | The Attention tile with keyboard focus on its title link: the ring drawn inside the tile | the same run, after Tab onto the title link                                                        |
| `lighthouse-summary.json`           | Accessibility, performance and best-practice scores and paint timings per route          | `npx --yes lighthouse@13` against `next start`; the method is recorded inside the file             |

Regenerate from `apps/web` after `npm run build` (from the repository root):

```bash
EVIDENCE_DIR=evidence npm run e2e --workspace @watchman/web
```
