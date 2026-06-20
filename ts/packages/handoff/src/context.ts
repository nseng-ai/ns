import { RealGitBrmemGateway, type BrmemGateway } from "@asdl/brmem";
import { resolveClinkrInteraction, type ClinkrInteraction } from "@asdl/clinkr";
import { NodeCommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";
import { readStdinLine } from "@asdl/core/stdin";

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
	const stderr = (text: string) => process.stderr.write(text);
	return {
		cwd,
		env,
		git: new RealGitGateway(execApi),
		brmem: new RealGitBrmemGateway(cwd, execApi),
		interaction: resolveClinkrInteraction({ stdin: readStdinLine, stderr }),
		stderr,
	};
}
