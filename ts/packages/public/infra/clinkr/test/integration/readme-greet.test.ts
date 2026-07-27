import { spawn } from "node:child_process";
import path from "node:path";

import { expect, test } from "vitest";

interface ProcessResult {
	readonly exitCode: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

test("the exact README app wires process argv, stdin, stdout, and process.exitCode", async () => {
	const result = await runProcess(
		path.join(import.meta.dirname, "../fixtures/readme-greet/app.ts"),
		["--input-json", "--format", "json"],
		'{"name":"Ada","enthusiastic":true}',
	);
	expect(result).toEqual({
		exitCode: 0,
		stdout:
			'{\n  "status": "success",\n  "exitCode": 0,\n  "data": {\n    "message": "Hello, Ada!"\n  }\n}\n',
		stderr: "",
	});
});

async function runProcess(
	entrypoint: string,
	argv: readonly string[],
	stdin: string,
): Promise<ProcessResult> {
	return await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [entrypoint, ...argv], {
			cwd: path.resolve(import.meta.dirname, "../../../.."),
			stdio: ["pipe", "pipe", "pipe"],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", reject);
		child.on("close", (exitCode) => {
			resolve({
				exitCode,
				stdout: Buffer.concat(stdout).toString("utf8"),
				stderr: Buffer.concat(stderr).toString("utf8"),
			});
		});
		child.stdin.end(stdin);
	});
}
