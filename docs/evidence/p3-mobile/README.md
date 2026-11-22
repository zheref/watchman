# P3 mobile evidence

Screenshot of the Attention tile in `apps/mobile`, rendered from the synthetic fixture
`packages/core/fixtures/synthetic/full.json` (every figure is invented). Expo Go on the iOS 17.5
simulator (iPhone 15, 393 × 852 pt), started with `npm run start:mobile` and pressing `i`; the first
screen of the app, not scrolled. The simulator's status-bar clock is the host's.

| Scene                | Device    | File                                                     |
| -------------------- | --------- | -------------------------------------------------------- |
| `attention-iphone15` | iPhone 15 | [attention-ios-iphone15.png](attention-ios-iphone15.png) |

Not captured here: the Android emulator, 320 dp width, the largest text sizes, the "No data",
"manual" and link-failed states (none is reachable from the bundled fixture without a render
harness), and screen-reader traversal.
