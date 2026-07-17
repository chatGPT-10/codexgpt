import { writeFile } from "node:fs/promises";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("OUTPUT_PATH_REQUIRED");
await writeFile(outputPath, "node-ok", { encoding: "utf8", flag: "wx" });
