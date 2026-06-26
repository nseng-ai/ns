import { RealGitBrmemGateway, type BrmemGateway } from "@sdl/brmem";
import { resolveClinkrInteraction, type ClinkrInteraction } from "@sdl/clinkr";
import { NodeCommandExecApi } from "@sdl/core/exec";
import { RealGitGateway, type GitGateway } from "@sdl/core/git";
import { readStdinLine } from "@sdl/core/stdin";

export interface HandoffCliContext {
	cwd: string;
	env: NodeJS.ProcessEnv;
	git: GitGateway;
	brmem: BrmemGateway;
	interaction: ClinkrInteraction;
	// Interactive prompt/status sink; Clinkr framework stderr is supplied separately through runCli IO.
	stderr: (text: string) => void;
}

export function createRealHandoffContext(
	options: { cwd?: string | undefined; env?: NodeJS.ProcessEnv | undefined } = {},
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
		interaction: resolveClinkrInteraction({
			stdin: readStdinLine,
			stderr,
		}),
		stderr,
	};
}
