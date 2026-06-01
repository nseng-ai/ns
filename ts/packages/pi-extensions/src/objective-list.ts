import { parseMachineEnvelopeData } from "./machine-envelope.ts";

export interface ObjectiveListRecord {
	slug: string;
	status: string;
	latestUpdateIso: string | null;
}

export interface ObjectiveList {
	trunkBranch: string;
	rootPath: string;
	statusFilter: string;
	namesOnly: boolean;
	records: ObjectiveListRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseObjectiveListRecord(value: unknown, index: number): ObjectiveListRecord {
	if (!isRecord(value)) {
		throw new Error(`Invalid Objective list record at index ${index}: expected an object.`);
	}

	const slug = value.slug;
	const status = value.status;
	const latestUpdateIso = value.latest_update_iso;
	if (
		typeof slug !== "string" ||
		typeof status !== "string" ||
		(latestUpdateIso !== null && typeof latestUpdateIso !== "string")
	) {
		throw new Error(
			`Invalid Objective list record at index ${index}: expected slug, status, and latest_update_iso.`,
		);
	}

	return { slug, status, latestUpdateIso };
}

export function parseObjectiveList(stdout: string): ObjectiveList {
	const data = parseMachineEnvelopeData(stdout, { label: "objective list JSON" });

	const trunkBranch = data.trunk_branch;
	const rootPath = data.root_path;
	const statusFilter = data.status_filter;
	const namesOnly = data.names_only;
	const records = data.records;
	if (
		typeof trunkBranch !== "string" ||
		typeof rootPath !== "string" ||
		typeof statusFilter !== "string" ||
		typeof namesOnly !== "boolean" ||
		!Array.isArray(records)
	) {
		throw new Error(
			"Invalid objective list JSON: expected trunk_branch, root_path, status_filter, names_only, and records.",
		);
	}

	return {
		trunkBranch,
		rootPath,
		statusFilter,
		namesOnly,
		records: records.map(parseObjectiveListRecord),
	};
}
