import process from "node:process";

import { parseArgs } from "./cli-args.ts";
import { scanReinvention } from "./scan-reinvention.ts";

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
	writeJson({ success: false, error: { code: parsed.code, message: parsed.message } });
	process.exitCode = 1;
} else {
	const output = await scanReinvention({
		cwd: process.cwd(),
		...parsed.value,
	});
	writeJson(output);
	if (!output.success) process.exitCode = 1;
}

function writeJson(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
