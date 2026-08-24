import {
	NodeBrmemSourceReader,
	RealGitBrmemGateway,
	type BrmemGateway,
	type BrmemSourceReader,
} from "@nseng-ai/brmem";
import { resolveClinkrInteraction, type ClinkrInteraction } from "@nseng-ai/clinkr";
import { NodeCommandExecApi, type CommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { readStdinLine } from "@nseng-ai/foundation/cli-runtime";
import {
	createNodeEffectiveProjectConfig,
	type EffectiveProjectConfig,
} from "@nseng-ai/sdk/project-config";

export interface HandoffCliContext {
	cwd: string;
	env: NodeJS.ProcessEnv;
	commands: CommandExecApi;
	git: GitGateway;
	projectConfig: EffectiveProjectConfig;
	brmem: BrmemGateway;
	sourceReader: BrmemSourceReader;
	interaction: ClinkrInteraction;
	// Interactive prompt/status sink; Clinkr framework stderr is supplied separately by command runners.
	stderr: (text: string) => void;
}

export function createRealHandoffContext(
	options: { cwd?: string; env?: NodeJS.ProcessEnv; signal?: AbortSignal } = {},
): HandoffCliContext {
	const cwd = options.cwd ?? process.cwd();
	const env = { ...(options.env ?? process.env) };
	const execApi = new NodeCommandExecApi();
	const git = new RealGitGateway(execApi);
	const projectConfig = createNodeEffectiveProjectConfig({
		cwd,
		env,
		commands: execApi,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	const stderr = (text: string) => process.stderr.write(text);
	return {
		cwd,
		env,
		commands: execApi,
		git,
		projectConfig,
		brmem: new RealGitBrmemGateway({ cwd, commands: execApi, git }),
		sourceReader: new NodeBrmemSourceReader(),
		interaction: resolveClinkrInteraction({
			stdin: readStdinLine,
			stderr,
		}),
		stderr,
	};
}
