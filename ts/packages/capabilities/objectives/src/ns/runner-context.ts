import { readFile, stat } from "node:fs/promises";

import { NsCommandExecApi } from "@nseng-ai/capability-kit/command-runner";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { RealGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import {
	errorCodeFromUnknown,
	formatErrorMessage,
	optionalEntries,
} from "@nseng-ai/foundation/primitives";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import type { ObjectiveStorage } from "../core/storage.ts";
import type {
	ObjectiveRunnerCoreContext,
	RunnerFilePresenceResult,
	RunnerTextFileReadResult,
} from "../runner/context.ts";
import { createNsObjectiveContext } from "./context.ts";

export interface ObjectiveRunnerOverrides {
	git?: GitGateway;
	graphite?: GraphiteBranchGateway;
	commands?: CommandExecApi;
	storage?: ObjectiveStorage;
	readTextFile?: (path: string) => Promise<RunnerTextFileReadResult>;
	filePresence?: (path: string) => Promise<RunnerFilePresenceResult>;
}

/**
 * Context for the decomposed runner bookends (`runner-begin`/`runner-finish`,
 * ADR 0024). Reads `ctx.extensions.objectiveRunner` core overrides.
 */
export async function createNsObjectiveRunnerCoreContext(
	ctx: NsExtensionApi,
	overrides: ObjectiveRunnerOverrides | undefined = readObjectiveRunnerOverrides(ctx),
): Promise<ObjectiveRunnerCoreContext> {
	const base = await createNsObjectiveContext(
		ctx,
		optionalEntries({ git: overrides?.git, storage: overrides?.storage }),
	);
	const commands = overrides?.commands ?? new NsCommandExecApi(ctx);
	return {
		...base,
		commands,
		graphite: overrides?.graphite ?? new RealGraphiteBranchGateway(commands),
		outputFormat: ctx.outputFormat ?? "human",
		writeStdout: ctx.stdout ?? (() => {}),
		phase: (label) => {
			ctx.commandIo.phase(label);
		},
		readTextFile: overrides?.readTextFile ?? readRunnerTextFile,
		filePresence: overrides?.filePresence ?? runnerFilePresence,
	};
}

function readObjectiveRunnerOverrides(ctx: NsExtensionApi): ObjectiveRunnerOverrides | undefined {
	const raw = ctx.extensions?.objectiveRunner;
	if (raw === undefined || raw === null || typeof raw !== "object") return undefined;
	const overrides = raw as Partial<ObjectiveRunnerOverrides>;
	return optionalEntries({
		git: overrides.git,
		graphite: overrides.graphite,
		commands: overrides.commands,
		storage: overrides.storage,
		readTextFile: overrides.readTextFile,
		filePresence: overrides.filePresence,
	});
}

async function readRunnerTextFile(path: string): Promise<RunnerTextFileReadResult> {
	try {
		return { type: "ok", content: await readFile(path, "utf8") };
	} catch (error) {
		return { type: "error", message: formatErrorMessage(error) };
	}
}

async function runnerFilePresence(path: string): Promise<RunnerFilePresenceResult> {
	try {
		await stat(path);
		return { type: "present" };
	} catch (error) {
		if (errorCodeFromUnknown(error) === "ENOENT") return { type: "missing" };
		return { type: "error", message: formatErrorMessage(error) };
	}
}
