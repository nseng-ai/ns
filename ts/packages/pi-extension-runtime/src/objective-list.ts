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

export interface ObjectiveListParseValid {
	type: "valid";
	list: ObjectiveList;
}

export interface ObjectiveListParseInvalid {
	type: "invalid";
	message: string;
}

export type ObjectiveListParseResult = ObjectiveListParseValid | ObjectiveListParseInvalid;

type ObjectiveListRecordParseResult =
	| { type: "valid"; record: ObjectiveListRecord }
	| { type: "invalid"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseObjectiveListRecord(value: unknown, index: number): ObjectiveListRecordParseResult {
	if (!isRecord(value)) {
		return { type: "invalid", message: `Invalid Objective list record at index ${index}: expected an object.` };
	}

	const slug = value.slug;
	const status = value.status;
	const latestUpdateIso = value.latest_update_iso;
	if (
		typeof slug !== "string" ||
		typeof status !== "string" ||
		(latestUpdateIso !== null && typeof latestUpdateIso !== "string")
	) {
		return {
			type: "invalid",
			message: `Invalid Objective list record at index ${index}: expected slug, status, and latest_update_iso.`,
		};
	}

	return { type: "valid", record: { slug, status, latestUpdateIso } };
}

export function parseObjectiveList(stdout: string): ObjectiveListParseResult {
	const envelope = parseMachineEnvelopeData(stdout, { label: "objective list JSON" });
	if (envelope.type !== "valid") {
		return { type: "invalid", message: envelope.message };
	}

	const data = envelope.data;
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
		return {
			type: "invalid",
			message: "Invalid objective list JSON: expected trunk_branch, root_path, status_filter, names_only, and records.",
		};
	}

	const parsedRecords: ObjectiveListRecord[] = [];
	for (let index = 0; index < records.length; index += 1) {
		const parsedRecord = parseObjectiveListRecord(records[index], index);
		if (parsedRecord.type === "invalid") {
			return parsedRecord;
		}
		parsedRecords.push(parsedRecord.record);
	}

	return {
		type: "valid",
		list: {
			trunkBranch,
			rootPath,
			statusFilter,
			namesOnly,
			records: parsedRecords,
		},
	};
}
