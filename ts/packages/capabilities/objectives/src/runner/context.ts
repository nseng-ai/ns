import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import type { ClinkrFormat } from "@nseng-ai/sdk";

import type { ObjectiveCliContext } from "../core/context.ts";

/** Which of the two runner preconditions/verification regimes applies. */
export type RunnerStepMode = "default" | "recover";

export type RunnerTextFileReadResult =
	| { type: "ok"; content: string }
	| { type: "error"; message: string };

export type RunnerFilePresenceResult =
	| { type: "present" }
	| { type: "missing" }
	| { type: "error"; message: string };

/**
 * Dependency surface for the runner's deterministic bookends (ADR 0024):
 * preconditions, prompt/facts production, verification gate, commit, and
 * checkpoint rendering. No child dispatch.
 *
 * Extends the plain Objective CLI context with the runner's injected gateways
 * (Graphite tracking check, raw command exec for `git diff --check`) and the
 * presentation seams the step contract requires: `writeStdout` is a tactical
 * Runner Checkpoint stream for human/markdown modes until clinkr owns non-ok
 * stdout artifacts, and `phase` mirrors `NsCommandIo.phase` transient phase text.
 */
export interface ObjectiveRunnerCoreContext extends ObjectiveCliContext {
	graphite: GraphiteBranchGateway;
	commands: CommandExecApi;
	outputFormat: ClinkrFormat;
	writeStdout(text: string): void;
	/** Transient, human-facing phase text. Non-contractual wording. */
	phase(label: string): void;
	/** Minimal text-file read seam for actual content reads (`--guidance @file`, facts, reports). */
	readTextFile(path: string): Promise<RunnerTextFileReadResult>;
	/** Presence seam for fresh-path guards; unreadable occupied paths must not look missing. */
	filePresence(path: string): Promise<RunnerFilePresenceResult>;
}
