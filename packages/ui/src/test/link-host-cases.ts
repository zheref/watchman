/**
 * The pinned `linkHost` behaviour, as `[url, expected host]` pairs. The package's own test and one
 * test in each app run the same table, so the web and mobile apps are held to one answer.
 */
export const LINK_HOST_CASES: readonly (readonly [url: string, host: string])[] = [
  // The links a validated snapshot carries.
  ['https://github.com/zheref/x/pull/1?a=b', 'github.com'],
  ['https://example.com/a/b', 'example.com'],
  ['https://example.com', 'example.com'],
  ['https://example.com#top', 'example.com'],
  ['https://example.com?q=1', 'example.com'],
  ['https://sub.example.co.uk/path', 'sub.example.co.uk'],
  ['https://xn--bcher-kva.example/', 'xn--bcher-kva.example'],
  // Lower-case, and no port.
  ['https://Example.COM:8443/p', 'example.com'],
  ['HTTPS://EXAMPLE.COM/', 'example.com'],
  ['https://example.com:443', 'example.com'],
  ['https://example.com:/', 'example.com'],
  // Never the user part: the host is what follows the last `@`.
  ['https://user@example.com/', 'example.com'],
  ['https://user:secret@example.com:8443/p', 'example.com'],
  ['https://github.com@evil.example/login', 'evil.example'],
  ['https://a@b@example.com/', 'example.com'],
  // A browser reads `\` as `/`, so the authority ends there.
  ['https://evil.example\\@github.com/', 'evil.example'],
  // Never a throw: anything else is the empty string.
  ['', ''],
  ['not a link', ''],
  ['example.com', ''],
  ['//example.com/', ''],
  ['http://example.com/', ''],
  ['javascript:alert(1)', ''],
  ['data:text/html,x', ''],
  [' https://example.com/', ''],
  ['https://', ''],
  ['https:///path', ''],
  ['https://@/', ''],
  ['https://localhost/', ''],
  ['https://127.0.0.1/', ''],
  ['https://[::1]/', ''],
  ['https://example.com./', ''],
  ['https://-example.com/', ''],
  ['https://exa mple.com/', ''],
  ['https://exa\nmple.com/', ''],
  ['https://ex%61mple.com/', ''],
  ['https://bücher.example/', ''],
  ['https://example.com:99999/', ''],
  ['https://example.com:80a/', ''],
  ['https://example.c/', ''],
  [`https://${'a'.repeat(64)}.example/`, ''],
  [`https://${'a.'.repeat(130)}example/`, ''],
];
