import { execFile } from "node:child_process";

export type ClipboardCopyResult =
	| { type: "copied" }
	| { type: "failure"; reason: "backend_missing" | "subprocess_error"; detail: string };

export interface ClipboardGateway {
	copy(text: string): Promise<ClipboardCopyResult>;
}

export interface ProcessRunResult {
	type: "success";
}

export interface ProcessRunFailure {
	type: "failure";
	reason: "backend_missing" | "subprocess_error";
	detail: string;
}

export interface ClipboardProcessRunner {
	runPbcopy(input: string): Promise<ProcessRunResult | ProcessRunFailure>;
}

export class RealClipboardGateway implements ClipboardGateway {
	private readonly runner: ClipboardProcessRunner;

	constructor(options: { env?: NodeJS.ProcessEnv | undefined; runner?: ClipboardProcessRunner | undefined } = {}) {
		this.runner = options.runner ?? new RealClipboardProcessRunner(options.env ?? process.env);
	}

	async copy(text: string): Promise<ClipboardCopyResult> {
		const result = await this.runner.runPbcopy(text);
		if (result.type === "success") return { type: "copied" };
		return { type: "failure", reason: result.reason, detail: result.detail };
	}
}

export class RealClipboardProcessRunner implements ClipboardProcessRunner {
	private readonly env: NodeJS.ProcessEnv;

	constructor(env: NodeJS.ProcessEnv) {
		this.env = env;
	}

	async runPbcopy(input: string): Promise<ProcessRunResult | ProcessRunFailure> {
		return await new Promise((resolve) => {
			const child = execFile("pbcopy", [], { env: this.env }, (error, _stdout, stderr) => {
				if (error === null) {
					resolve({ type: "success" });
					return;
				}
				if (hasErrorCode(error, "ENOENT")) {
					resolve({ type: "failure", reason: "backend_missing", detail: "`pbcopy` not found on PATH (clipboard requires macOS)." });
					return;
				}
				const code = typeof error.code === "number" ? error.code : 1;
				resolve({ type: "failure", reason: "subprocess_error", detail: `\`pbcopy\` exited with code ${code}: ${stderr}` });
			});
			child.stdin?.end(input);
		});
	}
}

export class FakeClipboardGateway implements ClipboardGateway {
	private readonly result: ClipboardCopyResult;
	private readonly copiedTexts: string[] = [];

	constructor(result: ClipboardCopyResult = { type: "copied" }) {
		this.result = { ...result };
	}

	async copy(text: string): Promise<ClipboardCopyResult> {
		this.copiedTexts.push(text);
		return { ...this.result };
	}

	texts(): readonly string[] {
		return [...this.copiedTexts];
	}
}

function hasErrorCode(error: { code?: string | number | null }, code: string): boolean {
	return error.code === code;
}
