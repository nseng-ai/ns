const BRMEM_REFSPEC = "refs/brmem/*:refs/brmem/*";
const HEAD_PUSH_REFSPEC = "HEAD";

export type GitSetupAdditionReason =
	| "preserve-default-push"
	| "branch-memory-push"
	| "branch-memory-fetch";

export interface GitSetupAddition {
	key: string;
	value: string;
	reason: GitSetupAdditionReason;
}

export interface ExistingGitSetupConfig {
	push: readonly string[];
	fetch: readonly string[];
}

export interface GitSetupPlan {
	remote: string;
	existingPush: readonly string[];
	existingFetch: readonly string[];
	additions: readonly GitSetupAddition[];
}

export function buildGitSetupPlan(options: {
	remote: string;
	existing: ExistingGitSetupConfig;
}): GitSetupPlan {
	const pushKey = pushConfigKey(options.remote);
	const fetchKey = fetchConfigKey(options.remote);
	const additions: GitSetupAddition[] = [];
	if (options.existing.push.length === 0) {
		additions.push({ key: pushKey, value: HEAD_PUSH_REFSPEC, reason: "preserve-default-push" });
	}
	const plannedPushValues = additions
		.filter((addition) => addition.key === pushKey)
		.map((addition) => addition.value);
	if (
		!options.existing.push.includes(BRMEM_REFSPEC) &&
		!plannedPushValues.includes(BRMEM_REFSPEC)
	) {
		additions.push({ key: pushKey, value: BRMEM_REFSPEC, reason: "branch-memory-push" });
	}
	if (!options.existing.fetch.includes(BRMEM_REFSPEC)) {
		additions.push({ key: fetchKey, value: BRMEM_REFSPEC, reason: "branch-memory-fetch" });
	}
	return {
		remote: options.remote,
		existingPush: [...options.existing.push],
		existingFetch: [...options.existing.fetch],
		additions,
	};
}

export function pushConfigKey(remote: string): string {
	return `remote.${remote}.push`;
}

export function fetchConfigKey(remote: string): string {
	return `remote.${remote}.fetch`;
}

export { BRMEM_REFSPEC };
