#!/usr/bin/env node
const chunk = Buffer.alloc(8192, 0x58);
function writeForever() {
  while (process.stdout.write(chunk) && process.stderr.write(chunk)) {}
  process.stdout.once("drain", writeForever);
  process.stderr.once("drain", writeForever);
}
writeForever();
setInterval(() => {}, 1000);
