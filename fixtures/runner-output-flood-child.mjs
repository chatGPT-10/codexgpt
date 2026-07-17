#!/usr/bin/env node
const total = Number(process.argv[2] ?? 262144);
const chunkSize = 4096;
let written = 0;
while (written < total) {
  const size = Math.min(chunkSize, total - written);
  process.stdout.write(Buffer.alloc(size, 0x4f));
  process.stderr.write(Buffer.alloc(size, 0x45));
  written += size;
}
process.stdout.write("STDOUT-TAIL\n");
process.stderr.write("STDERR-TAIL\n");
