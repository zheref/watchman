// Vitest (Vite) resolves import.meta.glob at test time; core has no Vite client types, so the
// one signature its tests use is declared here.
interface ImportMeta {
  glob<T = unknown>(
    pattern: string | readonly string[],
    options: { eager: true; import?: string },
  ): Record<string, T>;
}
