import { readFile } from "node:fs/promises";

import { SdlCommandExecApi } from "@sdl/capability-kit/command-runner";
import type { GitGateway } from "@sdl/capability-kit/git";
import { RealGraphiteBranchGateway } from "@sdl/capability-kit/graphite/branch";
import type { GraphiteBranchGateway } from "@sdl/capability-kit/graphite/branch";
import type { CommandExecApi } from "@sdl/core/exec";
import { formatErrorMessage, optionalEntries } from "@sdl/core/primitives";
import type { SdlExtensionApi } from "@sdl/kernel/sdk";

import type { ObjectiveStorage } from "../core/storage.ts";
import type { ChildSessionGateway } from "../runner/child-session.ts";
import type {
	ObjectiveRunnerContext,
	ObjectiveRunnerCoreContext,
	RunnerTextFileReadResult,
} from "../runner/context.ts";
import { createSdlObjectiveContext } from "./context.ts";

/**
 * ADR0024-LEGACY-DELETE(this interface, ObjectiveRunnerComposition, the
 * `childSession` override field below, the legacy factory at the bottom, and
 * the ChildSessionGateway/ObjectiveRunnerContext imports): the composition
 * seam exists only for the legacy blocking `runner-step`.
 *
 * Everything the composed child-session adapter may need from the host at
 * construction time. Deliberately minimal: the composition root closes over
 * its own spawn/timer/clock choices (Slice 5); only host-derived facts travel
 * through this init.
 */
export interface ChildSessionGatewayInit {
	env: Record<string, string | undefined>;
}

/** Testing/wiring seam for the one Pi-coupled dependency of a runner step. */
export interface ObjectiveRunnerComposition {
	createChildSessionGateway(init: ChildSessionGatewayInit): ChildSessionGateway;
}

export interface ObjectiveRunnerOverrides {
	git?: GitGateway;
	graphite?: GraphiteBranchGateway;
	commands?: CommandExecApi;
	storage?: ObjectiveStorage;
	/** ADR0024-LEGACY-DELETE(field): consumed only by the legacy factory. */
	childSession?: ChildSessionGateway;
	readTextFile?: (path: string) => Promise<RunnerTextFileReadResult>;
}

/**
 * Context for the decomposed runner bookends (`runner-begin`/`runner-finish`,
 * ADR 0024): everything the legacy runner context carries except child
 * dispatch. Reads the same `ctx.extensions.objectiveRunner` overrides; a
 * `childSession` override is simply ignored here.
 */
export async function createSdlObjectiveRunnerCoreContext(
	ctx: SdlExtensionApi,
): Promise<ObjectiveRunnerCoreContext> {
	const overrides = readObjectiveRunnerOverrides(ctx);
	const base = await createSdlObjectiveContext(
		ctx,
		optionalEntries({ git: overrides?.git, storage: overrides?.storage }),
	);
	const commands = overrides?.commands ?? new SdlCommandExecApi(ctx);
	return {
		...base,
		commands,
		graphite: overrides?.graphite ?? new RealGraphiteBranchGateway(commands),
		outputFormat: ctx.outputFormat ?? "human",
		writeStdout: ctx.stdout ?? (() => {}),
		writeStderr: ctx.stderr ?? (() => {}),
		phase: (label) => {
			ctx.commandIo.phase(label);
		},
		readTextFile: overrides?.readTextFile ?? readRunnerTextFile,
	};
}

// ADR0024-LEGACY-DELETE(function): only exec-runner-step builds this context.
export async function createSdlObjectiveRunnerContext(
	ctx: SdlExtensionApi,
	composition: ObjectiveRunnerComposition,
): Promise<ObjectiveRunnerContext> {
	const overrides = readObjectiveRunnerOverrides(ctx);
	const core = await createSdlObjectiveRunnerCoreContext(ctx);
	return {
		...core,
		childSession:
			overrides?.childSession ?? composition.createChildSessionGateway({ env: ctx.env }),
	};
}

function readObjectiveRunnerOverrides(ctx: SdlExtensionApi): ObjectiveRunnerOverrides | undefined {
	const raw = ctx.extensions?.objectiveRunner;
	if (raw === undefined || raw === null || typeof raw !== "object") return undefined;
	const overrides = raw as Partial<ObjectiveRunnerOverrides>;
	return optionalEntries({
		git: overrides.git,
		graphite: overrides.graphite,
		commands: overrides.commands,
		storage: overrides.storage,
		childSession: overrides.childSession,
		readTextFile: overrides.readTextFile,
	});
}

async function readRunnerTextFile(path: string): Promise<RunnerTextFileReadResult> {
	try {
		return { type: "ok", content: await readFile(path, "utf8") };
	} catch (error) {
		return { type: "error", message: formatErrorMessage(error) };
	}
}
