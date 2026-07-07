import { access } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createNsGitGateway } from "@nseng-ai/capability-kit/git";
import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/capability-kit/ns-command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { NsCommand, NsCommandSchema } from "@nseng-ai/kernel/sdk";

import type { SkillsCommandContext } from "./skills-shared.ts";

type HarnessArtifactsNsCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, SkillsCommandContext>,
	"createContext"
>;

export function harnessArtifactsNsCommand<S extends NsCommandSchema, T>(
	options: HarnessArtifactsNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return createNsDomainCommand({
		...options,
		createContext: async (ctx) => {
			const repoRootResult = await createNsGitGateway(ctx).optionalRepoRoot({ cwd: ctx.cwd });
			const projectRoot =
				repoRootResult.type === "found" ? repoRootResult.value : await findGitMarkerRoot(ctx.cwd);
			return {
				cwd: ctx.cwd,
				projectRoot,
				...optionalEntry("homeDir", ctx.env.HOME),
				env: ctx.env,
			};
		},
	});
}

async function findGitMarkerRoot(cwd: string): Promise<string> {
	let current = cwd;
	while (true) {
		if (await pathExists(join(current, ".git"))) return current;
		const parent = dirname(current);
		if (parent === current) return cwd;
		current = parent;
	}
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}
