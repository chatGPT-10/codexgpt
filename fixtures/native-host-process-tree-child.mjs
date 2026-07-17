#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";

const duration = Number(process.argv[2] ?? 60000);
const recordPath = process.argv[3];
const systemRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
const commandProcessor = `${systemRoot}\\System32\\cmd.exe`;
const pingCount = Math.max(2, Math.ceil(duration / 1000) + 1);
const grandchild = spawn(commandProcessor, ["/d", "/c", `ping -n ${pingCount} 127.0.0.1 >nul`], {
  windowsHide: true,
  stdio: "ignore"
});
const record = { parentPid: process.pid, grandchildPid: grandchild.pid };
if (recordPath) fs.writeFileSync(recordPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "wx" });
process.stdout.write(`${JSON.stringify(record)}\n`);
setTimeout(() => {}, duration);
