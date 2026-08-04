import { createNsGitGateway } from "@nseng-ai/extension-kit";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	defineCommand,
	type DefineCommandSpec,
	type NsCommand,
	type NsCommandSchema,
} from "@nseng-ai/sdk";
import type { z } from "zod";

import type { SkillsCommandContext } from "./skills-shared.ts";

interface HarnessArtifactsNsCommandOptions<S extends NsCommandSchema, T> extends Omit<
	DefineCommandSpec<S, T>,
	"handler"
> {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	readonly handler: (
		context: SkillsCommandContext,
		request: z.output<S>,
	) => ReturnType<DefineCommandSpec<S, T>["handler"]>;
}

export function harnessArtifactsNsCommand<S extends NsCommandSchema, T>(
	options: HarnessArtifactsNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return defineCommand({
		schema: options.schema,
		...(options.resultSchema === undefined ? {} : { resultSchema: options.resultSchema }),
		...(options.positionals === undefined ? {} : { positionals: options.positionals }),
		...(options.options === undefined ? {} : { options: options.options }),
		...(options.renderHuman === undefined ? {} : { renderHuman: options.renderHuman }),
		...(options.renderMarkdown === undefined ? {} : { renderMarkdown: options.renderMarkdown }),
		handler: async (context, request) => {
			const repoRootResult = await createNsGitGateway(context).optionalRepoRoot({
				cwd: context.cwd,
			});
			const projectRoot = repoRootResult.type === "found" ? repoRootResult.value : context.cwd;
			return options.handler(
				{
					cwd: context.cwd,
					projectRoot,
					...optionalEntry("homeDir", context.homeDir),
					env: context.env,
				},
				request,
			);
		},
	});
}
