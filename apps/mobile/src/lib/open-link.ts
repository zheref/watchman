/** What opening an item's deep link came to. */
export type OpenResult = 'opened' | 'failed';

/** Spoken and shown when a link cannot be opened. */
export const LINK_FAILED_MESSAGE = 'Could not open that link.';

/**
 * Opens a deep link through `opener` (React Native's `Linking.openURL` in the app, a stub in
 * tests) and says how it went. Only `https` links are opened, whatever the caller passes: core
 * already restricts every Attention link to `https`, and this is the last guard before the
 * operating system is handed a URL. Never throws; a refusal or a rejection is `failed`.
 */
export async function openLink(
  url: string,
  opener: (url: string) => Promise<unknown>,
): Promise<OpenResult> {
  if (!/^https:\/\//i.test(url)) return 'failed';
  try {
    await opener(url);
    return 'opened';
  } catch {
    return 'failed';
  }
}
