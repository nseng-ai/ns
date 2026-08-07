import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { WriteCliCommandResultLogs } from "./cli-command-result-summary.ts";

export const writeCliCommandResultLogs: WriteCliCommandResultLogs = async function writeLogs(
	output,
) {
	try {
		const directory = await mkdtemp(join(tmpdir(), "ns-pi-cli-result-"));
		const stdoutPath = resolve(directory, "stdout.log");
		const stderrPath = resolve(directory, "stderr.log");
		await Promise.all([
			writeFile(stdoutPath, output.stdout, { encoding: "utf8", mode: 0o600, flag: "wx" }),
			writeFile(stderrPath, output.stderr, { encoding: "utf8", mode: 0o600, flag: "wx" }),
		]);
		return { ok: true, paths: { stdoutPath, stderrPath } };
	} catch (error) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		};
	}
};
