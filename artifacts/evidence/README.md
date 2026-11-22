# P0 artifact evidence

Screenshots of `artifacts/watchman-v0.tsx`, server-rendered with `react-dom/server` from the
embedded **synthetic** sample (`packages/core/fixtures/synthetic/full.json`; every figure is
invented) and captured with headless Chrome. No real snapshot is ever captured or committed.

| Scene                   | Viewport                                   | File                                                   |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------ |
| `artifact-1440`         | 1440 × 1300, reduced motion                | [artifact-1440.png](artifact-1440.png)                 |
| `artifact-390`          | a 390 px-wide frame in a 600 px window     | [artifact-390.png](artifact-390.png)                   |
| `artifact-partial-1440` | 1440 × 1300; `sources` marks GitHub failed | [artifact-partial-1440.png](artifact-partial-1440.png) |

The 390 px scene is rendered inside a 390 px iframe because headless Chrome will not open a window
that narrow; the dark band on the right is the window outside the frame.
