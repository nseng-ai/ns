import { readFile } from "node:fs/promises";

import { NsCommandExecApi } from "@nseng-ai/capability-kit/command-runner";
import { createFlowBranchPublicationClient } from "@nseng-ai/flow/api";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import type { ObjectiveRunnerPublicationFactsGateway } from "../publication/facts-gateway.ts";
import { createObjectiveRunnerBranchPublisher } from "../publication/flow-branch-publisher.ts";
import type { ObjectiveRunnerBranchPublisher } from "../publication/publish.ts";
import {
	RealPublicationAuthorizationStore,
	type PublicationAuthorizationStore,
} from "../publication/authorization-store.ts";
import { createRealObjectiveRunnerPublicationFactsGateway } from "../publication/real-facts-gateway.ts";
import { createNsObjectiveContext } from "./context.ts";

export interface ObjectiveRunnerPublicationCommandContext {
	cwd: string;
	repoRoot: string;
	trunkBranch: string;
	commands: CommandExecApi;
	facts: ObjectiveRunnerPublicationFactsGateway;
	publisher: ObjectiveRunnerBranchPublisher;
	authorizations: PublicationAuthorizationStore;
	readTextFile(
		path: string,
	): Promise<{ ok: true; content: string } | { ok: false; message: string }>;
}

/** Binds every publication collaborator to one NsCommandExecApi and command cwd. */
export async function createNsObjectiveRunnerPublicationContext(
	ctx: NsExtensionApi,
): Promise<ObjectiveRunnerPublicationCommandContext> {
	const commands = new NsCommandExecApi(ctx);
	const base = await createNsObjectiveContext(ctx, { git: new RealGitGateway(commands) });
	const flow = createFlowBranchPublicationClient({ cwd: ctx.cwd, commands });
	return {
		cwd: ctx.cwd,
		repoRoot: base.repoRoot,
		trunkBranch: base.trunkBranch,
		commands,
		facts: createRealObjectiveRunnerPublicationFactsGateway({
			cwd: ctx.cwd,
			trunkBranch: base.trunkBranch,
			commands,
			flow,
		}),
		publisher: createObjectiveRunnerBranchPublisher(flow),
		authorizations: new RealPublicationAuthorizationStore({ repoRoot: base.repoRoot }),
		readTextFile: async (path) => {
			try {
				return { ok: true, content: await readFile(path, "utf8") };
			} catch (error) {
				return { ok: false, message: formatErrorMessage(error) };
			}
		},
	};
}
