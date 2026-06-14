import type {
	AregGithubGateway,
	AregHostGateway,
	AregNpxSkillsGateway,
	AregSkillxWorkspaceGateway,
} from "./gateways.ts";

export interface AregCliContext {
	host: AregHostGateway;
	github: AregGithubGateway;
	npxSkills: AregNpxSkillsGateway;
	skillxWorkspace: AregSkillxWorkspaceGateway;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export interface AregCliContextDeps {
	host: AregHostGateway;
	github: AregGithubGateway;
	npxSkills: AregNpxSkillsGateway;
	skillxWorkspace: AregSkillxWorkspaceGateway;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export function createAregCliContext(deps: AregCliContextDeps): AregCliContext {
	return {
		host: deps.host,
		github: deps.github,
		npxSkills: deps.npxSkills,
		skillxWorkspace: deps.skillxWorkspace,
		cwd: deps.cwd,
		env: deps.env,
	};
}

export function createRealAregContext(options: { cwd?: string | undefined; env?: NodeJS.ProcessEnv | undefined } = {}): AregCliContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	return createAregCliContext({
		host: new DeferredAregHostGateway(),
		github: new DeferredAregGithubGateway(),
		npxSkills: new DeferredAregNpxSkillsGateway(),
		skillxWorkspace: new DeferredAregSkillxWorkspaceGateway(),
		cwd,
		env,
	});
}

class DeferredAregHostGateway implements AregHostGateway {
	async checkTool(options: Parameters<AregHostGateway["checkTool"]>[0]): ReturnType<AregHostGateway["checkTool"]> {
		return { type: "missing", tool: options.tool, message: "areg host adapters are deferred until the first command port." };
	}

	async resolveGitRoot(options: Parameters<AregHostGateway["resolveGitRoot"]>[0]): ReturnType<AregHostGateway["resolveGitRoot"]> {
		return { type: "not-a-git-repo", message: `areg git-root adapter is deferred for ${options.cwd}.` };
	}
}

class DeferredAregGithubGateway implements AregGithubGateway {
	async listSkillDirectoryNames(): ReturnType<AregGithubGateway["listSkillDirectoryNames"]> {
		return { type: "error", error: deferredAdapterError("github") };
	}
}

class DeferredAregNpxSkillsGateway implements AregNpxSkillsGateway {
	async addSkills(): ReturnType<AregNpxSkillsGateway["addSkills"]> {
		return { type: "error", error: deferredAdapterError("npx-skills") };
	}
}

class DeferredAregSkillxWorkspaceGateway implements AregSkillxWorkspaceGateway {
	async installIntoWorkspace(): ReturnType<AregSkillxWorkspaceGateway["installIntoWorkspace"]> {
		return { type: "error", error: deferredAdapterError("skillx-workspace") };
	}
}

function deferredAdapterError(adapter: string): { code: string; message: string } {
	return {
		code: "adapter-deferred",
		message: `areg ${adapter} adapter is deferred until a command consumes this gateway seam.`,
	};
}
