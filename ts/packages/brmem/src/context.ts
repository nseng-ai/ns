import type { BrmemGateway } from "./gateway.ts";
import { RealGitBrmemGateway } from "./real-git-gateway.ts";

export interface BrmemCliContext {
	gateway: BrmemGateway;
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin: () => Promise<string>;
}

export function createRealBrmemContext(options: { cwd?: string | undefined } = {}): BrmemCliContext {
	const cwd = options.cwd ?? process.cwd();
	return {
		gateway: new RealGitBrmemGateway(cwd),
		cwd,
		env: process.env,
		stdin: readProcessStdin,
	};
}

async function readProcessStdin(): Promise<string> {
	return await new Promise<string>((resolveStdin, reject) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			data += chunk;
		});
		process.stdin.on("error", reject);
		process.stdin.on("end", () => resolveStdin(data));
	});
}
