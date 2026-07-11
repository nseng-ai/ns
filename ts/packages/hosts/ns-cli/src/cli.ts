#!/usr/bin/env node

import { runNsCli } from "./cli/index.ts";

if (import.meta.main) {
	process.exitCode = await runNsCli(process.argv.slice(2));
}
