import { readFile, stat } from "node:fs/promises";
import { isAbsolute, basename, dirname } from "node:path";
import { describe, expect, test } from "vitest";

import { writeCliCommandResultLogs } from "../../src/commands/cli-command-result-log-writer.ts";

describe("CLI command result log writer", () => {
	test("writes exact private stdout and stderr logs under a dedicated temp directory", async () => {
		const result = await writeCliCommandResultLogs({
			stdout: "out\n\u001b[2J",
			stderr: "err\u0000",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(isAbsolute(result.paths.stdoutPath)).toBe(true);
		expect(isAbsolute(result.paths.stderrPath)).toBe(true);
		expect(basename(result.paths.stdoutPath)).toBe("stdout.log");
		expect(basename(result.paths.stderrPath)).toBe("stderr.log");
		expect(dirname(result.paths.stdoutPath)).toBe(dirname(result.paths.stderrPath));
		expect(basename(dirname(result.paths.stdoutPath))).toMatch(/^ns-pi-cli-result-/);
		expect(await readFile(result.paths.stdoutPath, "utf8")).toBe("out\n\u001b[2J");
		expect(await readFile(result.paths.stderrPath, "utf8")).toBe("err\u0000");
		expect((await stat(result.paths.stdoutPath)).mode & 0o777).toBe(0o600);
		expect((await stat(result.paths.stderrPath)).mode & 0o777).toBe(0o600);
	});
});
