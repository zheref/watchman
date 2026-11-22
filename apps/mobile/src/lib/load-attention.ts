import fixture from '@watchman/core/fixtures/synthetic/full.json';
import { attentionTileFromJson, type AttentionTileView } from './attention-view';

/**
 * Where the app's data comes from for now: the committed SYNTHETIC fixture in `@watchman/core`
 * (invented projects, example.com links). It is bundled, so the app makes no network request and
 * holds no token. Real snapshots stay server-side (see the README's safeguards), so a later phase
 * that shows real data would fetch it from the protected endpoint, never bundle it.
 *
 * Never throws: a fixture that fails core's validation is "no data".
 */
export function loadAttentionTile(): AttentionTileView {
  return attentionTileFromJson(fixture);
}
