import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import { activationFileSchema } from "./activation-files.ts";
import type { PreparedNsActivation } from "./activate-ns.ts";

const lifecyclePhaseSchema = z.enum([
	"repository-preflight",
	"configuration-preflight",
	"declaration-planning",
	"acquisition",
	"activation-preflight",
	"activation-apply",
	"managed-package-cleanup",
	"completion",
]);

const lifecycleDiagnosticFields = {
	code: z.string(),
	message: z.string(),
	path: z.string().optional(),
};

export const lifecycleStepSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("phase"),
		phase: lifecyclePhaseSchema,
		status: z.enum(["started", "completed", "skipped", "failed"]),
	}),
	z.object({
		type: z.literal("repository-resolved"),
		repoRoot: z.string(),
		trunkBranch: z.string(),
	}),
	z.object({
		type: z.literal("harnesses-resolved"),
		source: z.enum(["explicit", "ns-toml"]),
		harnesses: z.array(z.enum(["claude-code", "codex", "pi"])).readonly(),
	}),
	z.object({
		type: z.literal("declaration-decided"),
		sourceSpec: z.string(),
		nsTomlPath: z.string(),
		action: z.enum(["created", "appended", "removed", "unchanged", "absent"]),
	}),
	z.object({
		type: z.literal("acquisition-decided"),
		sourceSpec: z.string(),
		sourceKind: z.enum(["local", "npm"]),
		intent: z.enum([
			"install",
			"ensure-pinned",
			"refresh-floating",
			"local-in-place",
			"remove-managed",
		]),
		outcome: z.enum([
			"installed",
			"unchanged",
			"local-in-place",
			"planned",
			"refreshed",
			"restored",
			"not-applicable",
			"removed",
			"already-absent",
		]),
		moduleRoot: z.string().optional(),
		managedPath: z.string().optional(),
	}),
	z.object({
		type: z.literal("activation-planned"),
		descriptorCount: z.number().int().nonnegative(),
		fileCount: z.number().int().nonnegative(),
		consumerDirectoryCount: z.number().int().nonnegative(),
		artifactCount: z.number().int().nonnegative(),
	}),
	z.object({
		type: z.literal("activation-file-completed"),
		file: activationFileSchema,
		path: z.string(),
		change: z.enum(["created", "appended", "replaced", "unchanged"]),
	}),
	z.object({
		type: z.literal("consumer-directory-completed"),
		path: z.string(),
		change: z.enum(["created", "updated", "unchanged"]),
	}),
	z.object({
		type: z.literal("artifact-completed"),
		key: z.string(),
		action: z.enum(["installed", "refreshed", "unchanged", "conflicted", "removed"]),
		artifactId: z.string(),
		skillName: z.string(),
		harness: z.enum(["claude-code", "codex", "pi"]),
		targetArtifactPath: z.string(),
		manifestPath: z.string(),
		writtenFiles: z.array(z.string()).readonly(),
		conflictingFiles: z.array(z.string()).readonly(),
		removedFiles: z.array(z.string()).readonly().optional(),
		removalReason: z.string().optional(),
	}),
	z.object({
		type: z.literal("preservation"),
		subject: z.enum(["local-source", "consumer-data"]),
		path: z.string().optional(),
	}),
	z.object({
		type: z.literal("effect"),
		effect: z.enum([
			"dry-run-no-writes",
			"prospective-effects-available",
			"prospective-effects-unavailable",
		]),
	}),
	z.object({
		type: z.literal("failure"),
		phase: lifecyclePhaseSchema,
		...lifecycleDiagnosticFields,
	}),
]);

export type LifecycleStep = z.infer<typeof lifecycleStepSchema>;
export type LifecyclePhase = z.infer<typeof lifecyclePhaseSchema>;

export interface LifecycleTraceSink {
	emit(line: string): void;
}

export interface LifecycleRecorder {
	record(step: LifecycleStep): void;
	steps(): readonly LifecycleStep[];
}

export function createLifecycleRecorder(sink?: LifecycleTraceSink): LifecycleRecorder {
	const history: LifecycleStep[] = [];
	return {
		record(step) {
			const parsed = lifecycleStepSchema.parse(step);
			history.push(parsed);
			sink?.emit(renderLifecycleStepHuman(parsed));
		},
		steps() {
			return structuredClone(history);
		},
	};
}

export function recordLifecycleFailure(
	recorder: LifecycleRecorder,
	phase: LifecyclePhase,
	diagnostic: { readonly code: string; readonly message: string; readonly path?: string },
): void {
	recorder.record({ type: "phase", phase, status: "failed" });
	recorder.record({
		type: "failure",
		phase,
		code: diagnostic.code,
		message: diagnostic.message,
		...optionalEntry("path", diagnostic.path),
	});
}

export function recordActivationPlan(
	recorder: LifecycleRecorder,
	activation: PreparedNsActivation,
): void {
	recorder.record({
		type: "activation-planned",
		descriptorCount: activation.descriptors.length,
		fileCount: Object.keys(activation.files).length,
		consumerDirectoryCount: activation.consumerDirectories.length,
		artifactCount: activation.artifacts.artifacts.length,
	});
}

export function renderLifecycleStepHuman(step: LifecycleStep): string {
	switch (step.type) {
		case "phase":
			return `[${step.phase}] ${step.status}`;
		case "repository-resolved":
			return `Repository: ${step.repoRoot} (trunk ${step.trunkBranch})`;
		case "harnesses-resolved":
			return `Harnesses (${step.source}): ${step.harnesses.join(", ")}`;
		case "declaration-decided":
			return `Declaration: ${step.action} ${step.nsTomlPath} (${step.sourceSpec})`;
		case "acquisition-decided":
			return `Acquisition: ${step.intent} ${step.sourceSpec} -> ${step.outcome}${step.moduleRoot === undefined ? "" : ` at ${step.moduleRoot}`}`;
		case "activation-planned":
			return `Activation plan: ${step.descriptorCount} descriptors, ${step.fileCount} files, ${step.consumerDirectoryCount} consumer directories, ${step.artifactCount} artifacts`;
		case "activation-file-completed":
			return `File: ${step.path} ${step.change}`;
		case "consumer-directory-completed":
			return `Consumer directory: ${step.path} ${step.change}`;
		case "artifact-completed":
			return `Artifact: ${step.skillName} (${step.harness}) ${step.action}`;
		case "preservation":
			return `Preserved ${step.subject}${step.path === undefined ? "" : ` at ${step.path}`}`;
		case "effect":
			if (step.effect === "dry-run-no-writes") return "Effect: dry run; no writes performed";
			return `Effect: exact prospective effects ${step.effect === "prospective-effects-available" ? "available" : "unavailable"}`;
		case "failure":
			return `Failure [${step.code}]: ${step.message}${step.path === undefined ? "" : ` (${step.path})`}`;
	}
}

export function renderLifecycleMarkdown(
	title: string,
	summary: string,
	steps: readonly LifecycleStep[],
): string {
	return [
		`# ${title}`,
		"",
		summary,
		"",
		"## Lifecycle history",
		"",
		...steps.map((step) => `1. ${renderLifecycleStepHuman(step)}`),
	].join("\n");
}
