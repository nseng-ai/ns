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
import type { ObjectiveRunnerContext, RunnerTextFileReadResult } from "../runner/context.ts";
import { createSdlObjectiveContext } from "./context.ts";

/**
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

interface ObjectiveRunnerSdlExtensionOverrides {
	git?: GitGateway;
	graphite?: GraphiteBranchGateway;
	commands?: CommandExecApi;
	storage?: ObjectiveStorage;
	childSession?: ChildSessionGateway;
	readTextFile?: (path: string) => Promise<RunnerTextFileReadResult>;
}

export async function createSdlObjectiveRunnerContext(
	ctx: SdlExtensionApi,
	composition: ObjectiveRunnerComposition,
): Promise<ObjectiveRunnerContext> {
	const overrides = readObjectiveRunnerOverrides(ctx);
	const base = await createSdlObjectiveContext(ctx, {
		...(overrides?.git === undefined ? {} : { git: overrides.git }),
		...(overrides?.storage === undefined ? {} : { storage: overrides.storage }),
	});
	const commands = overrides?.commands ?? new SdlCommandExecApi(ctx);
	return {
		...base,
		commands,
		graphite: overrides?.graphite ?? new RealGraphiteBranchGateway(commands),
		childSession:
			overrides?.childSession ?? composition.createChildSessionGateway({ env: ctx.env }),
		writeStdout: ctx.stdout ?? (() => {}),
		writeStderr: ctx.stderr ?? (() => {}),
		phase: (label) => {
			ctx.commandIo.phase(label);
		},
		readTextFile: overrides?.readTextFile ?? readRunnerTextFile,
	};
}

function readObjectiveRunnerOverrides(
	ctx: SdlExtensionApi,
): ObjectiveRunnerSdlExtensionOverrides | undefined {
	const raw = ctx.extensions?.objectiveRunner;
	if (raw === undefined || raw === null || typeof raw !== "object") return undefined;
	const overrides = raw as Partial<ObjectiveRunnerSdlExtensionOverrides>;
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
