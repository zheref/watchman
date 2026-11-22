#!/usr/bin/env node
// The read-only Watchman MCP server over stdio. The workspace ships TypeScript sources, so tsx
// loads them; tsx resolves from this file, so the server starts whatever directory a client
// launches it from. stdout is the protocol channel: nothing here prints to it.
import { register } from 'tsx/esm/api';

register();
const { main } = await import('../src/main.ts');
if (main() === null) process.exitCode = 1;
