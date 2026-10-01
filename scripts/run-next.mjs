import { realpathSync } from "node:fs";
import { createRequire } from "node:module";

// Keep Next's build and runtime roots consistent across Windows junctions.
process.chdir(realpathSync(process.cwd()));
createRequire(import.meta.url)("next/dist/bin/next");
