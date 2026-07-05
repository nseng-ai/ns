import {
	NodeBrmemSourceReader,
	RealGitBrmemGateway,
	type BrmemGateway,
	type BrmemSourceReader,
} from "@nseng-ai/brmem";
import { resolveClinkrInteraction, type ClinkrInteraction } from "@nseng-ai/clinkr";
import { NodeCommandExecApi } from "@nseng-ai/core/exec";
import { RealGitGateway } from "@nseng-ai/capability-kit/git";
import type { GitGateway } from "@nseng-ai/capability-kit/git";
import { readStdinLine } from "@nseng-ai/core/cli-runtime";

export interface HandoffCliContext {
	cwd: string;
	env: NodeJS.ProcessEnv;
	git: GitGateway;
	brmem: BrmemGateway;
	sourceReader: BrmemSourceReader;
	interaction: ClinkrInteraction;
	// Interactive prompt/status sink; Clinkr framework stderr is supplied separately by command runners.
	stderr: (text: string) => void;
}

export function createRealHandoffContext(
	options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): HandoffCliContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const execApi = new NodeCommandExecApi();
	const git = new RealGitGateway(execApi);
	const stderr = (text: string) => process.stderr.write(text);
	return {
		cwd,
		env,
		git,
		brmem: new RealGitBrmemGateway({ cwd, commands: execApi, git }),
		sourceReader: new NodeBrmemSourceReader(),
		interaction: resolveClinkrInteraction({
			stdin: readStdinLine,
			stderr,
		}),
		stderr,
	};
}
