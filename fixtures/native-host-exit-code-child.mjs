#!/usr/bin/env node
const value = Number(process.argv[2] ?? 0);
process.stdout.write(`${JSON.stringify({ argv: process.argv.slice(1), value })}\n`);
if (!Number.isInteger(value)) process.exit(1);
process.exit(value);
