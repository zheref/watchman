/** An in-memory snapshot directory for tests: a missing file rejects like Node's readFile. */
export function memoryDir(dir: string, files: Record<string, unknown>) {
  const reads: string[] = [];
  const readText = (path: string): Promise<string> => {
    reads.push(path);
    const prefix = `${dir}/`;
    const name = path.startsWith(prefix) ? path.slice(prefix.length) : undefined;
    const value = name === undefined ? undefined : files[name];
    if (value === undefined) {
      return Promise.reject(
        Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), {
          code: 'ENOENT',
        }),
      );
    }
    return Promise.resolve(typeof value === 'string' ? value : JSON.stringify(value));
  };
  return { dir, readText, reads };
}
