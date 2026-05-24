export type ObjectiveBranchEntry = {
	branch: string;
	updatedIso: string | null;
	aheadBase: number;
};

export type ObjectiveListGroup = {
	slug: string;
	status: string;
	latestUpdateIso: string | null;
	latestWorkBranch: string | null;
	branches: ObjectiveBranchEntry[];
};

export type ObjectiveList = {
	baseBranch: string;
	trunkBranch: string;
	view: string;
	statusFilter: string;
	currentBranch: string | null;
	filteredToCurrent: boolean;
	namesOnly: boolean;
	groups: ObjectiveListGroup[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseObjectiveBranchEntry(value: unknown, groupIndex: number, branchIndex: number): ObjectiveBranchEntry {
	if (!isRecord(value)) {
		throw new Error(
			`Invalid Objective list branch at group ${groupIndex}, branch ${branchIndex}: expected an object.`,
		);
	}

	const branch = value.branch;
	const updatedIso = "updated_iso" in value ? value.updated_iso : value.tip_head_iso;
	const aheadBase = "ahead_base" in value ? value.ahead_base : value.ahead_trunk;
	if (
		typeof branch !== "string" ||
		(updatedIso !== null && typeof updatedIso !== "string") ||
		typeof aheadBase !== "number" ||
		!Number.isFinite(aheadBase)
	) {
		throw new Error(
			`Invalid Objective list branch at group ${groupIndex}, branch ${branchIndex}: expected branch, updated_iso, and ahead_base.`,
		);
	}

	return { branch, updatedIso, aheadBase };
}

function parseObjectiveListGroup(value: unknown, index: number): ObjectiveListGroup {
	if (!isRecord(value)) {
		throw new Error(`Invalid Objective list group at index ${index}: expected an object.`);
	}

	const slug = value.slug;
	const status = value.status ?? "";
	const latestUpdateIso = "latest_update_iso" in value ? value.latest_update_iso : null;
	const latestWorkBranch = "latest_work_branch" in value ? value.latest_work_branch : null;
	const branches = value.branches;
	if (
		typeof slug !== "string" ||
		typeof status !== "string" ||
		(latestUpdateIso !== null && typeof latestUpdateIso !== "string") ||
		(latestWorkBranch !== null && typeof latestWorkBranch !== "string") ||
		!Array.isArray(branches)
	) {
		throw new Error(
			`Invalid Objective list group at index ${index}: expected slug, status, latest_update_iso, latest_work_branch, and branches.`,
		);
	}

	return {
		slug,
		status,
		latestUpdateIso,
		latestWorkBranch,
		branches: branches.map((branch, branchIndex) => parseObjectiveBranchEntry(branch, index, branchIndex)),
	};
}

export function parseObjectiveList(stdout: string): ObjectiveList {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to parse objective list JSON: ${message}`);
	}

	if (!isRecord(parsed)) {
		throw new Error("Invalid objective list JSON: expected an envelope object.");
	}

	const envelopeExitCode = parsed.exit_code;
	if (typeof envelopeExitCode === "number" && envelopeExitCode !== 0) {
		throw new Error(`objective list returned envelope exit_code ${envelopeExitCode}.`);
	}

	const data = parsed.data;
	if (!isRecord(data)) {
		throw new Error("Invalid objective list JSON: expected a data object.");
	}

	const trunkBranch = data.trunk_branch;
	const baseBranch = data.base_branch ?? trunkBranch;
	const view = data.view;
	const statusFilter = data.status_filter ?? "";
	const currentBranch = data.current_branch;
	const filteredToCurrent = data.filtered_to_current;
	const namesOnly = data.names_only;
	const groups = data.groups;
	if (
		typeof trunkBranch !== "string" ||
		typeof baseBranch !== "string" ||
		typeof view !== "string" ||
		typeof statusFilter !== "string" ||
		(currentBranch !== null && typeof currentBranch !== "string") ||
		typeof filteredToCurrent !== "boolean" ||
		typeof namesOnly !== "boolean" ||
		!Array.isArray(groups)
	) {
		throw new Error(
			"Invalid objective list JSON: expected base_branch, trunk_branch, view, status_filter, current_branch, filtered_to_current, names_only, and groups.",
		);
	}

	return {
		baseBranch,
		trunkBranch,
		view,
		statusFilter,
		currentBranch,
		filteredToCurrent,
		namesOnly,
		groups: groups.map(parseObjectiveListGroup),
	};
}
