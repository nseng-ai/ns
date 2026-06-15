import type {
	ObjectiveDirtyPathParams,
	ObjectiveGitErrorInfo,
	ObjectiveGitFactsGateway,
	ObjectiveGitResult,
} from "./git-facts.ts";

export interface FakeObjectiveGitFactsGatewayOptions {
	dirtyPaths?: readonly string[] | undefined;
	failures?: Readonly<Record<string, ObjectiveGitErrorInfo>> | undefined;
}

export class FakeObjectiveGitFactsGateway implements ObjectiveGitFactsGateway {
	private readonly dirtyPaths: ReadonlySet<string>;
	private readonly failures: ReadonlyMap<string, ObjectiveGitErrorInfo>;
	private readonly dirtyChecks: ObjectiveDirtyPathParams[] = [];

	constructor(options: FakeObjectiveGitFactsGatewayOptions = {}) {
		this.dirtyPaths = new Set((options.dirtyPaths ?? []).map(normalizeRelativePath));
		this.failures = new Map(Object.entries(options.failures ?? {}).map(([path, error]) => [normalizeRelativePath(path), { ...error }]));
	}

	get hasUncommittedChangesUnderCalls(): readonly ObjectiveDirtyPathParams[] {
		return this.dirtyChecks.map((call) => ({ ...call }));
	}

	async hasUncommittedChangesUnder(params: ObjectiveDirtyPathParams): Promise<ObjectiveGitResult<boolean>> {
		this.dirtyChecks.push({ ...params });
		const path = normalizeRelativePath(params.relativePath);
		const failure = this.failures.get(path);
		if (failure !== undefined) return { ok: false, error: { ...failure } };
		return { ok: true, value: this.dirtyPaths.has(path) };
	}
}

function normalizeRelativePath(path: string): string {
	return path.replaceAll("\\", "/").replace(/\/+$/u, "").replace(/^\.\//u, "") || ".";
}
