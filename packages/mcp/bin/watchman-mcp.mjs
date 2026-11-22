#!/usr/bin/env node
// The read-only Watchman MCP server over stdio. The workspace ships TypeScript sources, so tsx
// loads them; tsx resolves from this file, so the server starts whatever directory a client
// launches it from. stdout is the protocol channel: nothing here prints to it.
//
// tsx is pinned to this package's own tsconfig: left to itself it searches upward from the
// launching process's working directory, and a tsconfig found there could remap the server's
// imports (its `paths`) to code of that directory's choosing. Its transform cache is off, so the
// server writes nothing to disk.
import { fileURLToPath } from 'node:url';

// Set before tsx loads (a static import would be hoisted above this line).
process.env.TSX_DISABLE_CACHE = '1';
const { register } = await import('tsx/esm/api');
register({ tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)) });
const { main } = await import('../src/main.ts');
if (main() === null) process.exitCode = 1;
