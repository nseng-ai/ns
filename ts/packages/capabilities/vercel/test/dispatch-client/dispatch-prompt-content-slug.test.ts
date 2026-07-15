import type {
	RawTextModelCommandResult,
	RawTextModelExecOptions,
} from "@nseng-ai/capability-kit/model-slug";
import { describe, expect, test } from "vitest";

import {
	buildDispatchContentSlugPrompt,
	createRealDispatchContentSlugGateway,
	normalizeDispatchSlugOverride,
} from "../../src/dispatch-client/content-slug.ts";

interface ExecCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly options: RawTextModelExecOptions;
}

class FakeContentSlugExec {
	readonly calls: ExecCall[] = [];
	private readonly results: RawTextModelCommandResult[];

	constructor(results: RawTextModelCommandResult | readonly RawTextModelCommandResult[]) {
		this.results = Array.isArray(results) ? [...results] : [results];
	}

	exec(
		command: string,
		args: string[],
		options: RawTextModelExecOptions,
	): Promise<RawTextModelCommandResult> {
		this.calls.push({ command, args: [...args], options: { ...options } });
		const result = this.results.shift();
		if (result === undefined) throw new Error("Unexpected extra slug model execution.");
		return Promise.resolve(result);
	}
}

const PROMPT = "Add lorem ipsum to the first TypeScript file.";

describe("dispatch content slug", () => {
	test("derives, normalizes, word-bounds, and length-bounds semantic prompt slugs", async () => {
		const exec = new FakeContentSlugExec({
			type: "exited",
			stdout:
				"Add Résumé Lorem Ipsum To First TypeScript File With Excessive Extra Context Words Forever\n",
			stderr: "",
			code: 0,
			signal: null,
		});
		const gateway = createRealDispatchContentSlugGateway(exec);

		const result = await gateway.deriveSemanticSlug({
			kind: "prompt",
			content: PROMPT,
			cwd: "/repo",
		});

		expect(result).toEqual({
			ok: true,
			slug: "add-resume-lorem-ipsum-to-first-typescript",
		});
		expect(exec.calls).toHaveLength(1);
		expect(exec.calls[0]?.command).toBe("pi");
		const promptArg = exec.calls[0]?.args.at(-1);
		expect(promptArg).toContain(PROMPT);
	});

	test("returns a bounded domain failure for empty output and model failure without fallback", async () => {
		for (const result of [
			{ type: "exited", stdout: "", stderr: "", code: 0, signal: null } as const,
			{
				type: "exited",
				stdout: "",
				stderr: "secret-looking raw adapter detail",
				code: 1,
				signal: null,
			} as const,
		]) {
			const gateway = createRealDispatchContentSlugGateway(new FakeContentSlugExec(result));
			const derived = await gateway.deriveSemanticSlug({
				kind: "prompt",
				content: PROMPT,
				cwd: "/repo",
			});

			expect(derived).toMatchObject({ ok: false });
			if (derived.ok) continue;
			expect(derived.error.message).toContain("--slug/-s");
			expect(derived.error.message).not.toContain("secret-looking");
			expect(derived.error.message.length).toBeLessThan(300);
		}
	});

	test("builds a prompt for the delivered outcome and bounds supplied content", () => {
		const prompt = buildDispatchContentSlugPrompt({
			kind: "plan",
			content: "x".repeat(40_000),
			cwd: "/repo",
		});

		expect(prompt).toContain("actual code or product outcome");
		expect(prompt).toContain("## Dispatched plan content");
		expect(prompt).toContain("[Dispatched plan content truncated for slug generation]");
		expect(prompt).not.toContain("feature/source-provenance");
		expect(prompt.length).toBeLessThan(34_000);
	});

	test("normalizes explicit overrides with the shared branch-slug rules", () => {
		expect(normalizeDispatchSlugOverride("  Add Résumé_Widget!!!  ")).toBe("add-resume-widget");
		expect(normalizeDispatchSlugOverride("///")).toBeUndefined();
		expect(normalizeDispatchSlugOverride("x".repeat(100))).toBe("x".repeat(50));
	});
});
