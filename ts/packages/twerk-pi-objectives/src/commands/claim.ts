import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

const STATUS_KEY = "objective-claim";
const CUSTOM_TYPE = "objective-claim";
const DEFAULT_TIMEOUT_MS = 30_000;

type ObjectiveCommandCandidate = {
	command: string;
	prefixArgs: string[];
};

type ClinkrEnvelope<T> = {
	exit_code: number;
	data?: T;
	error_type?: string;
	message?: string;
};

type PlanSource = {
	kind?: string;
	branch?: string | null;
	from_file_path?: string | null;
	label?: string;
};

type ClaimPlan = {
	slug: string;
	target_branch: string;
	source: PlanSource;
};

type SlugAlternative = {
	slug: string;
	available_on_branch?: string;
};

type BranchAlternative = {
	branch: string;
	distance?: number;
};

type ClaimPlanAmbiguity = {
	reason: string;
	message: string;
	slug_alternatives?: SlugAlternative[];
	branch_alternatives?: BranchAlternative[];
};

type ClaimPlanError = {
	reason: string;
	message: string;
};

type ClaimPlanResult = {
	schema: string;
	canonical_branch?: string;
	requested_slug?: string | null;
	requested_target?: string | null;
	requested_from_branch?: string | null;
	requested_from_file?: string | null;
	status: "plan" | "ambiguous" | "error" | string;
	plan?: ClaimPlan | null;
	ambiguity?: ClaimPlanAmbiguity | null;
	error?: ClaimPlanError | null;
};

type CarriedFile = {
	file: string;
	key?: string;
};

type ClaimApplyResult = {
	schema?: string;
	slug: string;
	target_branch: string;
	source_kind?: string;
	source_branch?: string | null;
	source_label: string;
	files_carried: CarriedFile[];
	destination_ref: string;
	destination_commit_sha: string;
};

type ParsedArgs = {
	slug?: string;
	target?: string;
	fromBranch?: string;
	fromFile?: string;
};

type ObjectiveRun = {
	commandText: string;
	envelope: ClinkrEnvelope<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function messageFromUnknown(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function splitArgs(argsText: string): string[] {
	return argsText
		.trim()
		.split(/\s+/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

function parseArgs(argsText: string): ParsedArgs {
	const tokens = splitArgs(argsText);
	const parsed: ParsedArgs = {};
	let slug: string | undefined;

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === undefined) {
			break;
		}
		if (token === "--format" || token.startsWith("--format=")) {
			throw new Error("/objective-claim always uses JSON internally. Omit --format.");
		}
		if (token === "--schema" || token.startsWith("--schema=")) {
			throw new Error("/objective-claim does not support --schema. Run `objective exec claim-plan --schema` in a shell instead.");
		}
		if (token === "-h" || token === "--help") {
			throw new Error("Usage: /objective-claim [slug] [--target <branch>] [--from <branch>] [--from-file <path>]");
		}
		if (token.startsWith("--")) {
			const equalsIndex = token.indexOf("=");
			const flag = equalsIndex === -1 ? token : token.slice(0, equalsIndex);
			let value = equalsIndex === -1 ? undefined : token.slice(equalsIndex + 1);

			if (flag !== "--target" && flag !== "--from" && flag !== "--from-file") {
				throw new Error(`Unsupported flag for /objective-claim: ${flag}`);
			}
			if (value === undefined) {
				index += 1;
				value = tokens[index];
			}
			if (!value || value.startsWith("--")) {
				throw new Error(`Missing value for ${flag}.`);
			}

			if (flag === "--target") parsed.target = value;
			if (flag === "--from") parsed.fromBranch = value;
			if (flag === "--from-file") parsed.fromFile = value;
			continue;
		}

		if (slug !== undefined) {
			throw new Error("/objective-claim accepts at most one slug positional.");
		}
		slug = token;
	}

	if (slug !== undefined) {
		parsed.slug = slug;
	}
	return parsed;
}

function shellQuote(part: string): string {
	return /^[A-Za-z0-9_./:@%+=,-]+$/.test(part) ? part : JSON.stringify(part);
}

function formatCommand(parts: string[]): string {
	return parts.map(shellQuote).join(" ");
}

function summarizeOutput(value: string): string {
	const trimmed = value.trim().replace(/\s+/g, " ");
	return trimmed.length > 220 ? `${trimmed.slice(0, 217)}...` : trimmed;
}

function findAncestorContaining(startDir: string, relativePath: string): string | undefined {
	let current = resolve(startDir);
	for (;;) {
		if (existsSync(join(current, relativePath))) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) {
			return undefined;
		}
		current = parent;
	}
}

function resolveObjectiveCommandCandidates(cwd: string): ObjectiveCommandCandidate[] {
	const candidates: ObjectiveCommandCandidate[] = [];
	const seen = new Set<string>();

	const add = (candidate: ObjectiveCommandCandidate) => {
		const key = JSON.stringify(candidate);
		if (!seen.has(key)) {
			seen.add(key);
			candidates.push(candidate);
		}
	};

	const venvRoot = findAncestorContaining(cwd, join(".venv", "bin", "objective"));
	if (venvRoot) {
		add({ command: join(venvRoot, ".venv", "bin", "objective"), prefixArgs: [] });
	}

	add({ command: "objective", prefixArgs: [] });

	const projectRoot = findAncestorContaining(cwd, "pyproject.toml");
	if (projectRoot) {
		add({ command: "uv", prefixArgs: ["run", "--directory", projectRoot, "objective"] });
	}

	return candidates;
}

function parseClinkrEnvelope(stdout: string): ClinkrEnvelope<unknown> {
	const trimmed = stdout.trim();
	if (trimmed.length === 0) {
		throw new Error("Command returned no JSON output.");
	}

	const payload = JSON.parse(trimmed) as unknown;
	if (!isRecord(payload) || typeof payload.exit_code !== "number") {
		throw new Error("Command did not return a clinkr JSON envelope.");
	}
	return payload as ClinkrEnvelope<unknown>;
}

async function runObjectiveJson(pi: ExtensionAPI, ctx: ExtensionCommandContext, objectiveArgs: string[]): Promise<ObjectiveRun> {
	const failures: string[] = [];

	for (const candidate of resolveObjectiveCommandCandidates(ctx.cwd)) {
		const args = [...candidate.prefixArgs, ...objectiveArgs];
		const commandText = formatCommand([candidate.command, ...args]);
		try {
			const result = await pi.exec(candidate.command, args, {
				cwd: ctx.cwd,
				timeout: DEFAULT_TIMEOUT_MS,
			});
			try {
				return { commandText, envelope: parseClinkrEnvelope(result.stdout) };
			} catch (error) {
				const stdout = summarizeOutput(result.stdout);
				const stderr = summarizeOutput(result.stderr);
				failures.push(`${commandText}: ${messageFromUnknown(error)}${stderr ? `; stderr: ${stderr}` : ""}${stdout ? `; stdout: ${stdout}` : ""}`);
			}
		} catch (error) {
			failures.push(`${commandText}: ${messageFromUnknown(error)}`);
		}
	}

	throw new Error(`Unable to run objective CLI. Tried: ${failures.join(" | ")}`);
}

function requireSuccessfulEnvelope<T>(run: ObjectiveRun, label: string): T {
	const envelope = run.envelope as ClinkrEnvelope<T>;
	if (envelope.exit_code !== 0) {
		const reason = envelope.error_type ? `${envelope.error_type}: ` : "";
		throw new Error(`${label} failed: ${reason}${envelope.message ?? `exit_code=${envelope.exit_code}`}`);
	}
	if (envelope.data === undefined) {
		throw new Error(`${label} returned no data.`);
	}
	return envelope.data;
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === "string";
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
	return value === undefined || value === null || typeof value === "string";
}

function isPlanSource(value: unknown): value is PlanSource {
	return (
		isRecord(value) &&
		isOptionalString(value.kind) &&
		isOptionalNullableString(value.branch) &&
		isOptionalNullableString(value.from_file_path) &&
		isOptionalString(value.label)
	);
}

function isClaimPlan(value: unknown): value is ClaimPlan {
	return isRecord(value) && typeof value.slug === "string" && typeof value.target_branch === "string" && isPlanSource(value.source);
}

function isSlugAlternative(value: unknown): value is SlugAlternative {
	return isRecord(value) && typeof value.slug === "string" && isOptionalString(value.available_on_branch);
}

function isBranchAlternative(value: unknown): value is BranchAlternative {
	return isRecord(value) && typeof value.branch === "string" && (value.distance === undefined || typeof value.distance === "number");
}

function isClaimPlanAmbiguity(value: unknown): value is ClaimPlanAmbiguity {
	return (
		isRecord(value) &&
		typeof value.reason === "string" &&
		typeof value.message === "string" &&
		(value.slug_alternatives === undefined || (Array.isArray(value.slug_alternatives) && value.slug_alternatives.every(isSlugAlternative))) &&
		(value.branch_alternatives === undefined || (Array.isArray(value.branch_alternatives) && value.branch_alternatives.every(isBranchAlternative)))
	);
}

function isClaimPlanError(value: unknown): value is ClaimPlanError {
	return isRecord(value) && typeof value.reason === "string" && typeof value.message === "string";
}

function isClaimPlanResult(value: unknown): value is ClaimPlanResult {
	return (
		isRecord(value) &&
		typeof value.schema === "string" &&
		isOptionalString(value.canonical_branch) &&
		isOptionalNullableString(value.requested_slug) &&
		isOptionalNullableString(value.requested_target) &&
		isOptionalNullableString(value.requested_from_branch) &&
		isOptionalNullableString(value.requested_from_file) &&
		typeof value.status === "string" &&
		(value.plan === undefined || value.plan === null || isClaimPlan(value.plan)) &&
		(value.ambiguity === undefined || value.ambiguity === null || isClaimPlanAmbiguity(value.ambiguity)) &&
		(value.error === undefined || value.error === null || isClaimPlanError(value.error))
	);
}

function isCarriedFile(value: unknown): value is CarriedFile {
	return isRecord(value) && typeof value.file === "string" && isOptionalString(value.key);
}

function isClaimApplyResult(value: unknown): value is ClaimApplyResult {
	return (
		isRecord(value) &&
		isOptionalString(value.schema) &&
		typeof value.slug === "string" &&
		typeof value.target_branch === "string" &&
		isOptionalString(value.source_kind) &&
		isOptionalNullableString(value.source_branch) &&
		typeof value.source_label === "string" &&
		Array.isArray(value.files_carried) &&
		value.files_carried.every(isCarriedFile) &&
		typeof value.destination_ref === "string" &&
		typeof value.destination_commit_sha === "string"
	);
}

function buildPlanArgs(args: ParsedArgs): string[] {
	return [
		"exec",
		"claim-plan",
		...(args.slug ? [args.slug] : []),
		...(args.target ? ["--target", args.target] : []),
		...(args.fromBranch ? ["--from", args.fromBranch] : []),
		...(args.fromFile ? ["--from-file", args.fromFile] : []),
		"--format",
		"json",
	];
}

async function loadClaimPlan(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: ParsedArgs): Promise<ClaimPlanResult> {
	const run = await runObjectiveJson(pi, ctx, buildPlanArgs(args));
	const data = requireSuccessfulEnvelope<unknown>(run, "claim-plan");
	if (!isClaimPlanResult(data)) {
		throw new Error("claim-plan returned data that does not match the expected shape.");
	}
	return data;
}

function formatPlanError(error: ClaimPlanError | null | undefined): string {
	const reason = error?.reason ?? "error";
	const message = error?.message ?? "The objective could not be claimed.";
	return `Cannot claim objective:\n${reason}: ${message}`;
}

function formatAmbiguousSlugMessage(ambiguity: ClaimPlanAmbiguity): string {
	const alternatives = ambiguity.slug_alternatives ?? [];
	if (alternatives.length === 0) {
		return `Cannot claim objective:\n${ambiguity.reason}: ${ambiguity.message}`;
	}
	return `Multiple objectives are reachable. Re-run with one:\n${alternatives.map((alt) => `/objective-claim ${alt.slug}`).join("\n")}`;
}

function formatAmbiguousBranchMessage(slug: string | undefined, ambiguity: ClaimPlanAmbiguity): string {
	const alternatives = ambiguity.branch_alternatives ?? [];
	if (alternatives.length === 0) {
		return `Cannot claim objective:\n${ambiguity.reason}: ${ambiguity.message}`;
	}
	const prefix = `/objective-claim${slug ? ` ${slug}` : ""}`;
	return `Multiple source branches are reachable. Re-run with one:\n${alternatives.map((alt) => `${prefix} --from ${alt.branch}`).join("\n")}`;
}

async function resolveAmbiguity(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	args: ParsedArgs,
	planResult: ClaimPlanResult,
): Promise<{ args: ParsedArgs; planResult: ClaimPlanResult } | string> {
	const ambiguity = planResult.ambiguity;
	if (!ambiguity) {
		return "Cannot claim objective:\nambiguous: claim-plan did not include ambiguity details.";
	}

	if (ambiguity.reason === "no_slug_no_candidates") {
		return "No objective candidates found. Pass /objective-claim <slug> --from-file <path> or run objective-create.";
	}

	if (ambiguity.reason === "ambiguous_slug_candidates") {
		const alternatives = ambiguity.slug_alternatives ?? [];
		if (ctx.hasUI && alternatives.length > 0) {
			const selected = await ctx.ui.select(
				"Multiple objectives are reachable. Choose one to claim:",
				alternatives.map((alt) => alt.slug),
			);
			if (!selected) return "Objective claim cancelled.";
			const nextArgs = { ...args, slug: selected };
			return { args: nextArgs, planResult: await loadClaimPlan(pi, ctx, nextArgs) };
		}
		return formatAmbiguousSlugMessage(ambiguity);
	}

	if (ambiguity.reason === "ambiguous_source_branches") {
		const alternatives = ambiguity.branch_alternatives ?? [];
		if (ctx.hasUI && alternatives.length > 0) {
			const selected = await ctx.ui.select(
				"Multiple source branches are reachable. Choose one:",
				alternatives.map((alt) => alt.branch),
			);
			if (!selected) return "Objective claim cancelled.";
			const nextArgs = { ...args, fromBranch: selected };
			return { args: nextArgs, planResult: await loadClaimPlan(pi, ctx, nextArgs) };
		}
		return formatAmbiguousBranchMessage(args.slug ?? planResult.requested_slug ?? undefined, ambiguity);
	}

	return `Cannot claim objective:\n${ambiguity.reason}: ${ambiguity.message}`;
}

async function applyPlan(pi: ExtensionAPI, ctx: ExtensionCommandContext, planResult: ClaimPlanResult): Promise<ClaimApplyResult> {
	const dir = await mkdtemp(join(tmpdir(), "objective-claim-"));
	try {
		const planPath = join(dir, "claim-plan.json");
		await writeFile(planPath, `${JSON.stringify(planResult, null, 2)}\n`, "utf8");
		const run = await runObjectiveJson(pi, ctx, ["exec", "claim-apply", "--plan-file", planPath, "--format", "json"]);
		const data = requireSuccessfulEnvelope<unknown>(run, "claim-apply");
		if (!isClaimApplyResult(data)) {
			throw new Error("claim-apply returned data that does not match the expected shape.");
		}
		return data;
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function renderSuccess(result: ClaimApplyResult): string {
	const files = result.files_carried.map((file) => `- ${file.file}`).join("\n") || "- none";
	return `Claimed objective: ${result.slug}\nSource: ${result.source_label}\nTarget: ${result.target_branch}\n\nFiles carried:\n${files}\n\nDestination ref: ${result.destination_ref}\nCommit: ${result.destination_commit_sha}\n\nNext:\nThis branch is ready for implementation. After implementing the slice, merge\nthe PR and run objective-reconcile ${result.slug} on master. Run objective-update\n${result.slug} only if another branch will claim from this branch before it lands.`;
}

function emitMessage(pi: ExtensionAPI, content: string, details: Record<string, unknown> = {}): void {
	pi.sendMessage({
		customType: CUSTOM_TYPE,
		content,
		display: true,
		details,
	});
}

export function registerObjectiveClaim(pi: ExtensionAPI): void {
	pi.registerCommand("objective-claim", {
		description: "Claim an objective snapshot onto the current branch",
		handler: async (argsText, ctx) => {
			if (ctx.hasUI) {
				ctx.ui.setStatus(STATUS_KEY, "Claiming objective…");
			}

			try {
				let currentArgs = parseArgs(argsText);
				let planResult = await loadClaimPlan(pi, ctx, currentArgs);

				for (let attempts = 0; planResult.status === "ambiguous" && attempts < 3; attempts += 1) {
					const resolved = await resolveAmbiguity(pi, ctx, currentArgs, planResult);
					if (typeof resolved === "string") {
						emitMessage(pi, resolved, { status: "ambiguous" });
						if (ctx.hasUI) ctx.ui.notify(resolved.split("\n")[0] ?? resolved, "warning");
						return;
					}
					currentArgs = resolved.args;
					planResult = resolved.planResult;
				}

				if (planResult.status === "error") {
					const message = formatPlanError(planResult.error);
					emitMessage(pi, message, { status: "error", error: planResult.error });
					if (ctx.hasUI) ctx.ui.notify(message.split("\n")[0] ?? message, "error");
					return;
				}

				if (planResult.status !== "plan" || !planResult.plan) {
					throw new Error(`claim-plan returned unsupported status: ${planResult.status}`);
				}

				const applyResult = await applyPlan(pi, ctx, planResult);
				const message = renderSuccess(applyResult);
				emitMessage(pi, message, { status: "claimed", result: applyResult });
				if (ctx.hasUI) {
					ctx.ui.notify(`Claimed objective: ${applyResult.slug}`, "info");
				}
			} catch (error) {
				const message = `Objective claim failed: ${messageFromUnknown(error)}`;
				emitMessage(pi, message, { status: "failed" });
				if (ctx.hasUI) {
					ctx.ui.notify(message, "error");
				}
			} finally {
				if (ctx.hasUI) {
					ctx.ui.setStatus(STATUS_KEY, undefined);
				}
			}
		},
	});
}
