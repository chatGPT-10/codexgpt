#!/usr/bin/env node
import fs from "node:fs";

const [markerPath, source = "unknown"] = process.argv.slice(2);
if (!markerPath) process.exit(64);
fs.appendFileSync(markerPath, `${source}\n`, { encoding: "utf8" });
for await (const chunk of process.stdin) process.stdout.write(chunk);
