#!/usr/bin/env node
import fs from "node:fs";
const markerPath = process.argv[2];
if (markerPath) fs.appendFileSync(markerPath, `credential:${process.argv[3] ?? "unknown"}\n`, "utf8");
process.exit(72);
