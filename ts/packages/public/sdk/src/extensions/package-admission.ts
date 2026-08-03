import { NS_COMMAND_NAME_PATTERN, NS_COMMAND_NAME_RULE } from "../sdk/command-name.ts";

export type ExtensionPackageLevel = "preinstalled" | "user" | "project";

export interface ExtensionPackageCommandMetadata {
	readonly name: string;
	readonly group?: string;
	readonly path?: readonly string[];
}

export interface ExtensionPackageContribution<TPayload = unknown> {
	readonly contributionId: string;
	readonly packageName: string;
	readonly level: ExtensionPackageLevel;
	readonly commandKeys: readonly string[];
	readonly commandMetadata?: readonly ExtensionPackageCommandMetadata[];
	readonly requiresExtensions: readonly string[];
	readonly payload: TPayload;
}

export interface ExtensionPackageAdmissionDiagnostic {
	readonly severity: "error";
	readonly code:
		| "extension_package_builtin_conflict"
		| "extension_package_command_metadata_invalid"
		| "extension_package_same_level_conflict"
		| "extension_package_lower_level_conflict"
		| "extension_package_requirement_unsatisfied";
	readonly message: string;
	readonly contributionId: string;
	readonly packageName: string;
	readonly sourceLevel: ExtensionPackageLevel;
	readonly commandName?: string;
	readonly affectedCommandNames?: readonly string[];
	readonly relatedContributionIds?: readonly string[];
	readonly requiredPackageName?: string;
}

export interface ExtensionPackageAdmissionPlan<TPayload> {
	readonly admitted: readonly ExtensionPackageContribution<TPayload>[];
	readonly rejected: readonly ExtensionPackageContribution<TPayload>[];
	readonly diagnostics: readonly ExtensionPackageAdmissionDiagnostic[];
	readonly extensionPackageNames: ReadonlySet<string>;
}

const LEVELS_HIGH_TO_LOW = ["project", "user", "preinstalled"] as const;

/** Plan package-atomic command admission without loading command implementation modules. */
export function planExtensionPackageAdmission<TPayload>(options: {
	readonly contributions: readonly ExtensionPackageContribution<TPayload>[];
	readonly builtInCommandKeys: readonly string[];
}): ExtensionPackageAdmissionPlan<TPayload> {
	const contributions = [...options.contributions].sort(compareContributions);
	assertUniqueContributionIds(contributions);
	const rejectedIds = new Set<string>();
	const diagnostics: ExtensionPackageAdmissionDiagnostic[] = [];

	for (const contribution of contributions) {
		const invalid = invalidCommandMetadata(contribution);
		if (invalid === undefined) continue;
		rejectedIds.add(contribution.contributionId);
		diagnostics.push(
			diagnostic(contribution, {
				code: "extension_package_command_metadata_invalid",
				commandName: invalid.commandName,
				affectedCommandNames: [invalid.commandName],
				message: `Extension package ${contribution.packageName} (${contribution.contributionId}) has invalid command metadata for ${invalid.commandName}: ${invalid.field} must match ${NS_COMMAND_NAME_RULE}; the whole package was rejected.`,
			}),
		);
	}

	for (const contribution of contributions) {
		if (rejectedIds.has(contribution.contributionId)) continue;
		const conflicts = conflictingKeyPairs(contribution.commandKeys, options.builtInCommandKeys);
		if (conflicts.length === 0) continue;
		rejectedIds.add(contribution.contributionId);
		const affectedCommandNames = [...new Set(conflicts.map((conflict) => conflict.right))].sort();
		diagnostics.push(
			diagnostic(contribution, {
				code: "extension_package_builtin_conflict",
				...(conflicts[0]?.left === undefined ? {} : { commandName: conflicts[0].left }),
				affectedCommandNames,
				message: `Extension package ${contribution.packageName} (${contribution.contributionId}) conflicts with reserved built-in command paths ${affectedCommandNames.join(", ")}; the whole package was rejected.`,
			}),
		);
	}

	for (const contribution of contributions) {
		if (rejectedIds.has(contribution.contributionId)) continue;
		const conflict = firstInternalConflict(contribution.commandKeys);
		if (conflict === undefined) continue;
		rejectedIds.add(contribution.contributionId);
		diagnostics.push(
			diagnostic(contribution, {
				code: "extension_package_same_level_conflict",
				commandName: conflict.left,
				message: `Extension package ${contribution.packageName} (${contribution.contributionId}) contains conflicting command shapes ${conflict.left} and ${conflict.right}; the whole package was rejected.`,
			}),
		);
	}

	for (const level of LEVELS_HIGH_TO_LOW) {
		const atLevel = contributions.filter(
			(contribution) =>
				contribution.level === level && !rejectedIds.has(contribution.contributionId),
		);
		const conflicts = sameLevelConflicts(atLevel);
		for (const contribution of atLevel) {
			const peers = conflicts.get(contribution.contributionId);
			if (peers === undefined) continue;
			rejectedIds.add(contribution.contributionId);
			diagnostics.push(
				diagnostic(contribution, {
					code: "extension_package_same_level_conflict",
					relatedContributionIds: [...peers].sort(),
					message: `Extension package ${contribution.packageName} (${contribution.contributionId}) conflicts with another ${level} package; every participating whole package was rejected.`,
				}),
			);
		}
	}

	// This precedence pass is intentionally monotonic. Once a lower package loses to a
	// higher package, later requirement rejection of the higher package does not reopen
	// precedence and reconsider the lower package. That keeps admission deterministic and
	// conservative instead of making requirements an implicit fallback mechanism.
	const admittedHigher: ExtensionPackageContribution<TPayload>[] = [];
	for (const level of LEVELS_HIGH_TO_LOW) {
		for (const contribution of contributions.filter(
			(candidate) => candidate.level === level && !rejectedIds.has(candidate.contributionId),
		)) {
			const higherConflict = admittedHigher.find((higher) =>
				commandListsConflict(contribution.commandKeys, higher.commandKeys),
			);
			if (higherConflict !== undefined) {
				rejectedIds.add(contribution.contributionId);
				const conflict = firstConflictingKey(contribution.commandKeys, higherConflict.commandKeys);
				diagnostics.push(
					diagnostic(contribution, {
						code: "extension_package_lower_level_conflict",
						...(conflict === undefined ? {} : { commandName: conflict.left }),
						relatedContributionIds: [higherConflict.contributionId],
						message: `Extension package ${contribution.packageName} (${contribution.contributionId}) conflicts with higher-precedence package ${higherConflict.packageName} (${higherConflict.contributionId}); the whole lower-precedence package was rejected.`,
					}),
				);
				continue;
			}
			admittedHigher.push(contribution);
		}
	}

	let changed = true;
	while (changed) {
		changed = false;
		const admittedNames = new Set(
			contributions
				.filter((contribution) => !rejectedIds.has(contribution.contributionId))
				.map((contribution) => contribution.packageName),
		);
		for (const contribution of contributions) {
			if (rejectedIds.has(contribution.contributionId)) continue;
			const missing = contribution.requiresExtensions.find((name) => !admittedNames.has(name));
			if (missing === undefined) continue;
			rejectedIds.add(contribution.contributionId);
			changed = true;
			diagnostics.push(
				diagnostic(contribution, {
					code: "extension_package_requirement_unsatisfied",
					requiredPackageName: missing,
					message: `Extension package ${contribution.packageName} (${contribution.contributionId}) requires admitted extension package ${missing}; the whole package was rejected.`,
				}),
			);
		}
	}

	const admitted = contributions.filter(
		(contribution) => !rejectedIds.has(contribution.contributionId),
	);
	return {
		admitted,
		rejected: contributions.filter((contribution) => rejectedIds.has(contribution.contributionId)),
		diagnostics,
		extensionPackageNames: new Set(admitted.map((contribution) => contribution.packageName)),
	};
}

function diagnostic<TPayload>(
	contribution: ExtensionPackageContribution<TPayload>,
	details: Omit<
		ExtensionPackageAdmissionDiagnostic,
		"severity" | "contributionId" | "packageName" | "sourceLevel"
	>,
): ExtensionPackageAdmissionDiagnostic {
	return {
		severity: "error",
		contributionId: contribution.contributionId,
		packageName: contribution.packageName,
		sourceLevel: contribution.level,
		...details,
	};
}

function sameLevelConflicts<TPayload>(
	contributions: readonly ExtensionPackageContribution<TPayload>[],
): ReadonlyMap<string, ReadonlySet<string>> {
	const conflicts = new Map<string, Set<string>>();
	for (let leftIndex = 0; leftIndex < contributions.length; leftIndex += 1) {
		const left = contributions[leftIndex];
		if (left === undefined) continue;
		for (let rightIndex = leftIndex + 1; rightIndex < contributions.length; rightIndex += 1) {
			const right = contributions[rightIndex];
			if (right === undefined || !commandListsConflict(left.commandKeys, right.commandKeys))
				continue;
			addConflict(conflicts, left.contributionId, right.contributionId);
			addConflict(conflicts, right.contributionId, left.contributionId);
		}
	}
	return conflicts;
}

function addConflict(conflicts: Map<string, Set<string>>, id: string, peerId: string): void {
	const peers = conflicts.get(id);
	if (peers === undefined) conflicts.set(id, new Set([peerId]));
	else peers.add(peerId);
}

function commandListsConflict(left: readonly string[], right: readonly string[]): boolean {
	return firstConflictingKey(left, right) !== undefined;
}

function invalidCommandMetadata<TPayload>(
	contribution: ExtensionPackageContribution<TPayload>,
): { readonly commandName: string; readonly field: "name" | "group" | "path segment" } | undefined {
	const metadata = contribution.commandMetadata;
	if (metadata === undefined) {
		const invalidKey = contribution.commandKeys.find((key) =>
			key.split("/").some((segment) => !NS_COMMAND_NAME_PATTERN.test(segment)),
		);
		return invalidKey === undefined
			? undefined
			: { commandName: invalidKey, field: "path segment" };
	}
	for (const command of metadata) {
		const commandName =
			command.path?.join("/") ?? [command.group, command.name].filter(Boolean).join("/");
		if (!NS_COMMAND_NAME_PATTERN.test(command.name)) return { commandName, field: "name" };
		if (command.group !== undefined && !NS_COMMAND_NAME_PATTERN.test(command.group)) {
			return { commandName, field: "group" };
		}
		if (command.path?.some((segment) => !NS_COMMAND_NAME_PATTERN.test(segment)) === true) {
			return { commandName, field: "path segment" };
		}
	}
	return undefined;
}

function conflictingKeyPairs(
	left: readonly string[],
	right: readonly string[],
): readonly { readonly left: string; readonly right: string }[] {
	return left.flatMap((leftKey) =>
		right.flatMap((rightKey) =>
			commandKeysConflict(leftKey, rightKey) ? [{ left: leftKey, right: rightKey }] : [],
		),
	);
}

function firstInternalConflict(
	keys: readonly string[],
): { readonly left: string; readonly right: string } | undefined {
	for (let leftIndex = 0; leftIndex < keys.length; leftIndex += 1) {
		const left = keys[leftIndex];
		if (left === undefined) continue;
		for (let rightIndex = leftIndex + 1; rightIndex < keys.length; rightIndex += 1) {
			const right = keys[rightIndex];
			if (right !== undefined && commandKeysConflict(left, right)) return { left, right };
		}
	}
	return undefined;
}

function firstConflictingKey(
	left: readonly string[],
	right: readonly string[],
): { readonly left: string; readonly right: string } | undefined {
	for (const leftKey of left) {
		for (const rightKey of right) {
			if (commandKeysConflict(leftKey, rightKey)) return { left: leftKey, right: rightKey };
		}
	}
	return undefined;
}

function commandKeysConflict(left: string, right: string): boolean {
	return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function compareContributions<TPayload>(
	left: ExtensionPackageContribution<TPayload>,
	right: ExtensionPackageContribution<TPayload>,
): number {
	const level = LEVELS_HIGH_TO_LOW.indexOf(left.level) - LEVELS_HIGH_TO_LOW.indexOf(right.level);
	return level || left.contributionId.localeCompare(right.contributionId);
}

function assertUniqueContributionIds<TPayload>(
	contributions: readonly ExtensionPackageContribution<TPayload>[],
): void {
	const ids = new Set<string>();
	for (const contribution of contributions) {
		if (ids.has(contribution.contributionId)) {
			throw new Error(`Duplicate extension contribution id: ${contribution.contributionId}.`);
		}
		ids.add(contribution.contributionId);
	}
}
