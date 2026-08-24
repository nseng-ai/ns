import { isAbsolute } from "node:path";

import {
	MODEL_OPERATION_IDS,
	loadModelPolicy,
	resolveModelOperation,
} from "@nseng-ai/extension-kit/model-policy";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { extractJsonObjectText, parseLmJson } from "@nseng-ai/pi-runtime/models/lm-json";
import {
	captureRequiredEffectiveSkill,
	type EffectiveSkillInventoryHost,
	type RequiredEffectiveSkill,
} from "@nseng-ai/pi-runtime/skills/expansion";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import { z } from "zod";

export const SESSION_PLAN_DISCOVERY_SKILL_NAME = "session-plan-discovery";
export const SESSION_PLAN_DISCOVERY_LIMITS = Object.freeze({
	maxCandidates: 5,
	maxEvidenceExcerptsPerCandidate: 8,
	maxRationaleBytes: 1_024,
	maxEvidenceExcerptBytes: 1_024,
	maxStdoutBytes: 256 * 1_024,
	maxPlanMarkdownBytes: 200 * 1_024,
	timeoutMs: 120_000,
});

const utf8Encoder = new TextEncoder();

function boundedString(maxBytes: number, label: string) {
	return z
		.string()
		.min(1)
		.refine((value) => utf8Encoder.encode(value).length <= maxBytes, {
			message: `${label} exceeds ${maxBytes} UTF-8 bytes`,
		});
}

const rationaleSchema = boundedString(SESSION_PLAN_DISCOVERY_LIMITS.maxRationaleBytes, "rationale");
const evidenceExcerptSchema = boundedString(
	SESSION_PLAN_DISCOVERY_LIMITS.maxEvidenceExcerptBytes,
	"evidence excerpt",
);
const evidenceSchema = z
	.array(evidenceExcerptSchema)
	.min(1)
	.max(SESSION_PLAN_DISCOVERY_LIMITS.maxEvidenceExcerptsPerCandidate);
const planMarkdownSchema = boundedString(
	SESSION_PLAN_DISCOVERY_LIMITS.maxPlanMarkdownBytes,
	"plan Markdown",
);
const slugSchema = z
	.string()
	.min(1)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case");
const absoluteMarkdownPathSchema = rationaleSchema.refine(
	(value) => isAbsolute(value) && value.endsWith(".md"),
	"Saved Plan reference must be an absolute .md path",
);

export const savedPlanReferenceCandidateSchema = z.strictObject({
	type: z.literal("saved-plan-reference"),
	filePath: absoluteMarkdownPathSchema,
	basis: rationaleSchema,
	evidence: evidenceSchema,
});
export const presentedPlanCandidateSchema = z.strictObject({
	type: z.literal("presented-plan"),
	planMarkdown: planMarkdownSchema,
	suggestedSlug: slugSchema,
	basis: rationaleSchema,
	evidence: evidenceSchema,
});
export const planReadyCandidateSchema = z.strictObject({
	type: z.literal("plan-ready"),
	focus: rationaleSchema,
	basis: rationaleSchema,
	missingElements: z
		.array(rationaleSchema)
		.max(SESSION_PLAN_DISCOVERY_LIMITS.maxEvidenceExcerptsPerCandidate),
	evidence: evidenceSchema,
});

export const sessionPlanCandidateSchema = z.discriminatedUnion("type", [
	savedPlanReferenceCandidateSchema,
	presentedPlanCandidateSchema,
	planReadyCandidateSchema,
]);
export type SessionPlanCandidate = z.infer<typeof sessionPlanCandidateSchema>;

export const sessionPlanDiscoverySchema = z.discriminatedUnion("type", [
	savedPlanReferenceCandidateSchema,
	presentedPlanCandidateSchema,
	planReadyCandidateSchema,
	z.strictObject({
		type: z.literal("ambiguous"),
		basis: rationaleSchema,
		candidates: z
			.array(sessionPlanCandidateSchema)
			.min(1)
			.max(SESSION_PLAN_DISCOVERY_LIMITS.maxCandidates),
	}),
	z.strictObject({ type: z.literal("not-found"), reason: rationaleSchema }),
]);
export type SessionPlanDiscovery = z.infer<typeof sessionPlanDiscoverySchema>;

const savedPlanSaveEnvelopeSchema = z.strictObject({
	status: z.literal("ok"),
	exitCode: z.literal(0),
	data: z.strictObject({
		format: z.literal("timestamped"),
		slug: z.string(),
		filePath: z.string().min(1),
		fileName: z.string(),
		fileStem: z.string(),
		timestamp: z.string(),
		timestampNumber: z.number().int(),
		sequence: z.number().int().positive(),
		repoRoot: z.string(),
		repoKey: z.string(),
		repoIdentitySource: z.enum(["origin-url", "repo-root"]),
		sourceBranch: z.string(),
		branchKey: z.string(),
		directoryPath: z.string(),
	}),
});

export function parseSavedPlanSaveEnvelopeFilePath(value: unknown): string {
	const parsed = savedPlanSaveEnvelopeSchema.safeParse(value);
	if (!parsed.success) throw new Error("enriched-plan returned an invalid save result envelope.");
	return parsed.data.data.filePath;
}

/*
 * Refactor direction: replace the process machinery below with the shared
 * subagent child-session runtime once that runtime supports parent-session
 * forks and exact-skill resource policy.
 *
 * This is intentionally a temporary local implementation. It duplicates
 * capabilities already owned more completely by
 * `@internal/ns-pi-subagents/runner-subagents`: Pi subprocess launch, JSON
 * event handling, cancellation and forced termination, stderr bounds, final
 * assistant-text capture, child-session evidence, usage collection, progress,
 * and typed process failures. Keeping a second subprocess runner here would
 * create two implementations of the same host concern.
 *
 * The existing subagent runtime cannot be used unchanged. It currently creates
 * an empty child session and launches `pi --session <new-file>`. Discovery must
 * instead launch `pi --fork <persisted-parent-session>` so the model can inspect
 * the conversation visible in the parent. Fork mode also differs because Pi
 * allocates the child session file: the runtime must learn that path from the
 * JSON `session` event and must never confuse the parent source path with the
 * new child path. Launch-metadata hydration, progress, result evidence, and
 * usage collection must all use the dynamically discovered child path.
 *
 * The shared runtime also needs a semantic child resource policy rather than
 * caller-supplied argv. This discovery operation requires:
 *
 * - no tools;
 * - no ambient extensions, prompt templates, or context files;
 * - no discovered skills;
 * - exactly the captured effective skill path supplied with `--skill`;
 * - the configured model and thinking selection;
 * - final assistant text with wall-clock and streaming-output bounds.
 *
 * Add the capability beneath the model-visible `subagent` tool. Product
 * commands should dispatch the runtime directly; they should not ask the
 * parent model to invoke `subagent(...)`. A suitable shared contract has an
 * explicit session source (`new` or `fork`), an exact-skills resource policy,
 * model selection, prompt, limits, and `AbortSignal`. Fork mode should be
 * subprocess-only until the in-process Pi adapter can preserve equivalent
 * semantics; requesting an unsupported execution architecture must fail rather
 * than silently start an empty session.
 *
 * Package disposition matters. This incubating package may not depend on the
 * internal `@internal/ns-pi-subagents` package. Move/extract the reusable
 * child-Pi process/session substrate into an incubating Pi host seam (most
 * likely `@nseng-ai/pi-runtime`) and make both `ns-pi-subagents` and this
 * package consume it. `ns-pi-subagents` should continue to own agent
 * descriptors, runtime selection, Fleet UI, and the model-visible delegation
 * interface; the lower seam should own generic child-session mechanics.
 *
 * After that seam exists, delete from this file:
 *
 * - SessionPlanDiscoveryProcessRequest and ProcessResult;
 * - SessionPlanDiscoveryProcessGateway;
 * - buildSessionPlanDiscoveryArgs;
 * - createSessionPlanDiscoveryProcessGateway;
 * - the local process outcome switch and duplicated timeout/stdout/cancellation
 *   plumbing in discoverSessionPlan.
 *
 * Keep here the Saved Plan domain behavior: model-operation resolution, the
 * discovery schemas and limits, JSON extraction/validation, contradictory
 * result rejection, and translation from shared runner outcomes into
 * SessionPlanDiscovery failure codes. Tests should prove existing new-session
 * subagents remain compatible, fork argv uses `--fork` rather than `--session`,
 * child paths come from JSON session evidence, exact-skill isolation flags are
 * applied, and timeout/cancellation/output limits terminate the child safely.
 */
export interface SessionPlanDiscoveryProcessRequest {
	readonly cwd: string;
	readonly args: readonly string[];
	readonly timeoutMs: number;
	readonly maxStdoutBytes: number;
	readonly signal?: AbortSignal;
}

export type SessionPlanDiscoveryProcessResult =
	| {
			readonly type: "exited";
			readonly stdout: string;
			readonly stderr: string;
			readonly code: number;
	  }
	| { readonly type: "spawn-failed"; readonly message: string }
	| { readonly type: "timed-out" }
	| { readonly type: "cancelled" }
	| { readonly type: "stdout-limit-exceeded" };

export interface SessionPlanDiscoveryProcessGateway {
	run(request: SessionPlanDiscoveryProcessRequest): Promise<SessionPlanDiscoveryProcessResult>;
}

export interface SessionPlanDiscoveryContext {
	readonly modelPolicy: ProjectConfigGateway;
	readonly process: SessionPlanDiscoveryProcessGateway;
}

export interface DiscoverSessionPlanOptions {
	readonly repoRoot: string;
	readonly persistedSessionPath: string;
	readonly skill: RequiredEffectiveSkill;
	readonly signal?: AbortSignal;
}

export type SessionPlanDiscoveryFailureCode =
	| "session-unavailable"
	| "skill-unavailable"
	| "model-policy"
	| "process-unavailable"
	| "process-exit"
	| "timeout"
	| "cancelled"
	| "stdout-limit"
	| "invalid-output";

export type DiscoverSessionPlanResult =
	| { readonly ok: true; readonly value: SessionPlanDiscovery }
	| {
			readonly ok: false;
			readonly error: {
				readonly code: SessionPlanDiscoveryFailureCode;
				readonly message: string;
			};
	  };

export type CaptureSessionPlanDiscoverySkillResult =
	| { readonly ok: true; readonly value: RequiredEffectiveSkill }
	| {
			readonly ok: false;
			readonly error: { readonly code: "skill-unavailable"; readonly message: string };
	  };

export function captureSessionPlanDiscoverySkill(
	host: EffectiveSkillInventoryHost,
): CaptureSessionPlanDiscoverySkillResult {
	try {
		return {
			ok: true,
			value: captureRequiredEffectiveSkill(host, SESSION_PLAN_DISCOVERY_SKILL_NAME),
		};
	} catch (error) {
		return {
			ok: false,
			error: { code: "skill-unavailable", message: errorMessage(error) },
		};
	}
}

export async function discoverSessionPlan(
	context: SessionPlanDiscoveryContext,
	options: DiscoverSessionPlanOptions,
): Promise<DiscoverSessionPlanResult> {
	if (options.persistedSessionPath.trim() === "") {
		return failure("session-unavailable", "The current Pi session is not persisted.");
	}
	if (
		options.skill.name !== SESSION_PLAN_DISCOVERY_SKILL_NAME ||
		options.skill.filePath.trim() === ""
	) {
		return failure(
			"skill-unavailable",
			`The effective ${SESSION_PLAN_DISCOVERY_SKILL_NAME} skill is unavailable.`,
		);
	}

	let selection: ModelSelection;
	try {
		const policy = loadModelPolicy({ repoRoot: options.repoRoot, gateway: context.modelPolicy });
		if (!policy.ok) return failure("model-policy", policy.error.message);
		const operation = resolveModelOperation(
			policy.value,
			MODEL_OPERATION_IDS.plansSessionDiscovery,
		);
		if (!operation.ok) return failure("model-policy", operation.error.message);
		selection = operation.value.selection;
	} catch (error) {
		return failure("model-policy", errorMessage(error));
	}

	let processResult: SessionPlanDiscoveryProcessResult;
	try {
		processResult = await context.process.run({
			cwd: options.repoRoot,
			args: buildSessionPlanDiscoveryArgs(
				options.persistedSessionPath,
				options.skill.filePath,
				selection,
			),
			timeoutMs: SESSION_PLAN_DISCOVERY_LIMITS.timeoutMs,
			maxStdoutBytes: SESSION_PLAN_DISCOVERY_LIMITS.maxStdoutBytes,
			...(options.signal === undefined ? {} : { signal: options.signal }),
		});
	} catch (error) {
		return failure("process-unavailable", errorMessage(error));
	}

	switch (processResult.type) {
		case "spawn-failed":
			return failure("process-unavailable", processResult.message);
		case "timed-out":
			return failure("timeout", "Session plan discovery timed out.");
		case "cancelled":
			return failure("cancelled", "Session plan discovery was cancelled.");
		case "stdout-limit-exceeded":
			return failure("stdout-limit", "Session plan discovery exceeded its stdout limit.");
		case "exited":
			if (processResult.code !== 0) {
				return failure(
					"process-exit",
					`Session plan discovery exited with code ${processResult.code}.`,
				);
			}
			return parseSessionPlanDiscoveryOutput(processResult.stdout);
	}
}

export function buildSessionPlanDiscoveryArgs(
	persistedSessionPath: string,
	skillFilePath: string,
	model: ModelSelection,
): string[] {
	return [
		"--fork",
		persistedSessionPath,
		"--provider",
		model.provider,
		"--model",
		model.modelId,
		"--thinking",
		model.thinking,
		"--no-tools",
		"--no-skills",
		"--no-extensions",
		"--no-prompt-templates",
		"--no-context-files",
		"--skill",
		skillFilePath,
		"--print",
		`/skill:${SESSION_PLAN_DISCOVERY_SKILL_NAME}`,
	];
}

export function parseSessionPlanDiscoveryOutput(stdout: string): DiscoverSessionPlanResult {
	if (utf8Encoder.encode(stdout).length > SESSION_PLAN_DISCOVERY_LIMITS.maxStdoutBytes) {
		return failure("stdout-limit", "Session plan discovery exceeded its stdout limit.");
	}
	const parsed = parseLmJson(stdout, sessionPlanDiscoverySchema, {
		invalidShapeError: "session plan discovery result has an invalid shape",
	});
	if (!parsed.ok) return failure("invalid-output", parsed.error);

	const firstObject = extractJsonObjectText(stdout);
	if (firstObject === null) return failure("invalid-output", "response contains no JSON object");
	let remainder = stdout.slice(stdout.indexOf(firstObject) + firstObject.length);
	while (true) {
		const nextObject = extractJsonObjectText(remainder);
		if (nextObject === null) break;
		const next = parseLmJson(nextObject, sessionPlanDiscoverySchema, {
			invalidShapeError: "not a discovery result",
		});
		if (next.ok && JSON.stringify(next.value) !== JSON.stringify(parsed.value)) {
			return failure(
				"invalid-output",
				"response contains contradictory session plan discovery result objects",
			);
		}
		remainder = remainder.slice(remainder.indexOf(nextObject) + nextObject.length);
	}
	return { ok: true, value: parsed.value };
}

export function formatSessionPlanCandidate(candidate: SessionPlanCandidate): string {
	const lines = [
		`Candidate: ${candidate.type}`,
		`Basis: ${candidate.basis}`,
		"Evidence:",
		...candidate.evidence.map((excerpt) => `- ${excerpt}`),
	];
	if (candidate.type === "saved-plan-reference") lines.push(`Path: ${candidate.filePath}`);
	if (candidate.type === "presented-plan") {
		lines.push(`Suggested slug: ${candidate.suggestedSlug}`);
		lines.push("Presented plan preview:", candidate.planMarkdown);
	}
	if (candidate.type === "plan-ready") {
		lines.push(`Focus: ${candidate.focus}`);
		if (candidate.missingElements.length > 0) {
			lines.push("Missing elements:", ...candidate.missingElements.map((item) => `- ${item}`));
		}
	}
	return lines.join("\n");
}

export function formatSessionPlanCandidateLabel(
	candidate: SessionPlanCandidate,
	index: number,
): string {
	return `${index + 1}. ${candidate.type}: ${candidate.basis}`;
}

export function formatSessionPlanDiscoveryTerminal(discovery: SessionPlanDiscovery): string {
	if (discovery.type === "not-found") {
		return `Session plan discovery found no actionable plan: ${discovery.reason}. Continue planning or run /ns:plan:save after the plan is ready.`;
	}
	return "Session plan candidate selection was cancelled; no latest-plan fallback was attempted.";
}

export function createSessionPlanDiscoveryProcessGateway(
	commands: CommandExecApi,
): SessionPlanDiscoveryProcessGateway {
	return {
		async run(request) {
			const outputAbort = new AbortController();
			let stdoutBytes = 0;
			let exceeded = false;
			const cancel = (): void => outputAbort.abort();
			request.signal?.addEventListener("abort", cancel, { once: true });
			if (request.signal?.aborted === true) cancel();
			try {
				const result = await commands.exec("pi", [...request.args], {
					cwd: request.cwd,
					timeout: request.timeoutMs,
					signal: outputAbort.signal,
					onStdout(text) {
						stdoutBytes += utf8Encoder.encode(text).length;
						if (stdoutBytes > request.maxStdoutBytes) {
							exceeded = true;
							outputAbort.abort();
						}
					},
				});
				if (exceeded) return { type: "stdout-limit-exceeded" };
				if (request.signal?.aborted === true || result.type === "cancelled") {
					return { type: "cancelled" };
				}
				if (result.type === "timed-out") return { type: "timed-out" };
				if (result.type === "spawn-failed") {
					return { type: "spawn-failed", message: result.error };
				}
				return {
					type: "exited",
					stdout: result.stdout,
					stderr: result.stderr,
					code: result.code ?? 1,
				};
			} finally {
				request.signal?.removeEventListener("abort", cancel);
			}
		},
	};
}

function failure(
	code: SessionPlanDiscoveryFailureCode,
	message: string,
): DiscoverSessionPlanResult {
	return { ok: false, error: { code, message } };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
