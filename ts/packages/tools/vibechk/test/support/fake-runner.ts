import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Metrics } from "../../src/models.ts";
import type { Runner, RunnerRequest, RunnerResult } from "../../src/runners.ts";

export interface FakeRunnerOptions {
	exitCode?: number;
	changesByWorkdir?: Record<string, string>;
	metricsByWorkdir?: Record<string, Partial<Metrics>>;
}

export class FakeRunner implements Runner {
	readonly name = "fake";
	private readonly exitCode: number;
	private readonly changesByWorkdir: Record<string, string>;
	private readonly metricsByWorkdir: Record<string, Partial<Metrics>>;

	constructor(options: FakeRunnerOptions = {}) {
		this.exitCode = options.exitCode ?? 0;
		this.changesByWorkdir = options.changesByWorkdir ?? {};
		this.metricsByWorkdir = options.metricsByWorkdir ?? {};
	}

	async run(
		request: RunnerRequest,
		transcriptSink: (text: string) => void,
		_stdoutSink: (text: string) => void,
	): Promise<RunnerResult> {
		const workdirName = request.workdir.split("/").pop() ?? "unknown";
		const transcriptText = `fake transcript for ${workdirName}\n`;
		transcriptSink(transcriptText);

		if (workdirName in this.changesByWorkdir) {
			const content = this.changesByWorkdir[workdirName];
			if (content !== undefined) {
				// Ensure workdir exists for test scenarios
				await mkdir(request.workdir, { recursive: true });
				await writeFile(join(request.workdir, "result.txt"), content, "utf-8");
			}
		}

		const partialMetrics = this.metricsByWorkdir[workdirName] ?? {};
		const metrics: Metrics = {
			wallTimeSeconds: partialMetrics.wallTimeSeconds ?? null,
			inputTokens: partialMetrics.inputTokens ?? null,
			outputTokens: partialMetrics.outputTokens ?? null,
			totalTokens: partialMetrics.totalTokens ?? null,
			costUsd: partialMetrics.costUsd ?? null,
		};

		return {
			exitCode: this.exitCode,
			transcript: "",
			metrics,
			artifacts: {},
			runnerVersion: "fake-1",
		};
	}
}
