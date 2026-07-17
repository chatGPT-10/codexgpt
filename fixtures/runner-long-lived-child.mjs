#!/usr/bin/env node
const duration = Number(process.argv[2] ?? 30000);
process.stdout.write(`ready:${process.pid}\n`);
setTimeout(() => {
  process.stdout.write("completed\n");
}, duration);
