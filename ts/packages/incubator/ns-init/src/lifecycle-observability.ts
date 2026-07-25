import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { ALL_HARNESS_IDS } from "@nseng-ai/harness-artifacts/api";
import { z } from "zod";

import {
	consumerDirectoryOutcomeSchema,
	declaredArtifactActivationOutcomeShape,
	fileActivationOutcomeSchema,
} from "./activation-outcomes.ts";
import { activationFileSchema } from "./activation-files.ts";
import type { PreparedNsActivation } from "./activate-ns.ts";
import { normalizeExtensionDiagnostic } from "./diagnostic-collection.ts";

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

const lifecycleDiagnosticSchema = z.object({
	code: z.string(),
	message: z.string(),
	path: z.string().optional(),
});

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
		harnesses: z.array(z.enum(ALL_HARNESS_IDS)).readonly(),
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
	fileActivationOutcomeSchema.extend({
		type: z.literal("activation-file-completed"),
		file: activationFileSchema,
		path: z.string(),
	}),
	consumerDirectoryOutcomeSchema.extend({
		type: z.literal("consumer-directory-completed"),
	}),
	z.object({
		type: z.literal("artifact-completed"),
		...declaredArtifactActivationOutcomeShape,
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
	lifecycleDiagnosticSchema.extend({
		type: z.literal("failure"),
		phase: lifecyclePhaseSchema,
	}),
]);

export type LifecycleStep = z.infer<typeof lifecycleStepSchema>;
export type LifecyclePhase = z.infer<typeof lifecyclePhaseSchema>;
export type LifecycleDetail = Exclude<LifecycleStep, { readonly type: "phase" | "failure" }>;
export type LifecycleDiagnostic = z.infer<typeof lifecycleDiagnosticSchema>;

export interface LifecycleTraceSink {
	emit(line: string): void;
}

export interface LifecycleRecorder {
	beginPhase(phase: Exclude<LifecyclePhase, "completion">): void;
	endPhase(): void;
	skipPhase(phase: Exclude<LifecyclePhase, "completion">): void;
	fail(diagnostic: LifecycleDiagnostic): void;
	complete(): void;
	record(detail: LifecycleDetail): void;
	steps(): readonly LifecycleStep[];
}

export function createLifecycleRecorder(sink?: LifecycleTraceSink): LifecycleRecorder {
	const history: LifecycleStep[] = [];
	let activePhase: Exclude<LifecyclePhase, "completion"> | undefined;
	let isTerminal = false;

	function append(step: LifecycleStep): void {
		const ownedStep = structuredClone(step);
		history.push(ownedStep);
		sink?.emit(renderLifecycleStepHuman(ownedStep));
	}

	function assertNotTerminal(operation: string): void {
		if (isTerminal) throw new Error(`Cannot ${operation} after the lifecycle is terminal.`);
	}

	function closeActivePhase(): void {
		if (activePhase === undefined) return;
		append({ type: "phase", phase: activePhase, status: "completed" });
		activePhase = undefined;
	}

	return {
		beginPhase(phase) {
			assertNotTerminal(`begin phase ${phase}`);
			if (activePhase === phase) throw new Error(`Lifecycle phase ${phase} is already active.`);
			closeActivePhase();
			append({ type: "phase", phase, status: "started" });
			activePhase = phase;
		},
		endPhase() {
			assertNotTerminal("end the active phase");
			if (activePhase === undefined)
				throw new Error("Cannot end a lifecycle phase without an active phase.");
			closeActivePhase();
		},
		skipPhase(phase) {
			assertNotTerminal(`skip phase ${phase}`);
			if (activePhase === phase) throw new Error(`Cannot skip active lifecycle phase ${phase}.`);
			closeActivePhase();
			append({ type: "phase", phase, status: "skipped" });
		},
		fail(diagnostic) {
			assertNotTerminal("fail");
			if (activePhase === undefined)
				throw new Error("Cannot fail a lifecycle without an active phase.");
			const normalizedDiagnostic = normalizeExtensionDiagnostic(diagnostic);
			append({ type: "phase", phase: activePhase, status: "failed" });
			append({
				type: "failure",
				phase: activePhase,
				code: normalizedDiagnostic.code,
				message: normalizedDiagnostic.message,
				...optionalEntry("path", normalizedDiagnostic.path),
			});
			activePhase = undefined;
			isTerminal = true;
		},
		complete() {
			assertNotTerminal("complete");
			closeActivePhase();
			append({ type: "phase", phase: "completion", status: "completed" });
			isTerminal = true;
		},
		record(detail) {
			assertNotTerminal("record a lifecycle detail");
			append(detail);
		},
		steps() {
			return structuredClone(history);
		},
	};
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
