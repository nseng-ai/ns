import {
	isValidObjectiveOwner,
	parseObjectiveLocatorString,
	renderObjectiveLocator,
} from "../identity.ts";
import type { ObjectiveRecordDocument, ObjectiveRecordFrontmatter } from "../record-frontmatter.ts";
import {
	findRecordLocation,
	type ObjectiveRecordDocumentReadResult,
	type ObjectiveRecordLocation,
	type ObjectiveStorage,
	type ObjectiveStorageResult,
	type ObjectiveStructuralFinding,
} from "../storage.ts";
import {
	objectiveMdExistsCheck,
	objectiveMdReadableCheck,
	type ObjectiveCheckItem,
} from "./check-items.ts";

/**
 * Record Frontmatter structural linter (ADR 0050): owner, Blocked Sentence,
 * and Objective Edge lint. Every violation is an error: missing/malformed
 * frontmatter, missing or invalid owner, owner/path disagreement for
 * owner-nested records, empty blocked sentence, empty annotation, non-locator
 * edge endpoints, dangling/self/duplicate edges, and a missing mirror side.
 * Edge endpoints and their identity are full `<owner>/<slug>` Objective
 * Locators; mirror lookups resolve counterparts through discovered inventory
 * across every owner (including legacy flat closed records).
 */

export interface ObjectiveEdgeLintOptions {
	storage: ObjectiveStorage;
	/** Discovered inventory records used for edge endpoint and mirror resolution. */
	records: readonly ObjectiveRecordLocation[];
	location: ObjectiveRecordLocation;
	document: ObjectiveRecordDocument;
}

export async function objectiveEdgeLintChecks(
	options: ObjectiveEdgeLintOptions,
): Promise<ObjectiveStorageResult<readonly ObjectiveCheckItem[]>> {
	return await lintObjectiveRecordFrontmatterState({
		storage: options.storage,
		records: options.records,
		location: options.location,
		state: recordFrontmatterStateFromDocument({
			recordRelativePath: options.location.recordRelativePath,
			document: options.document,
		}),
	});
}

export interface ObjectiveStructuralSweepReport {
	recordCount: number;
	violations: readonly ObjectiveCheckItem[];
}

/**
 * Repo-wide structural sweep: storage hygiene findings from discovery, deep
 * structure findings, and every record's Record Frontmatter lint (owner,
 * blocked, full-locator edges), reporting only violations.
 */
export async function sweepObjectiveStructure(
	storage: ObjectiveStorage,
): Promise<ObjectiveStorageResult<ObjectiveStructuralSweepReport>> {
	const inventory = await storage.checkoutInventory();
	if (!inventory.ok) return inventory;

	const violations: ObjectiveCheckItem[] = [
		...structuralFindingsToCheckItems(inventory.value.findings),
	];
	const deepFindings = await storage.deepStructureFindings(inventory.value);
	if (!deepFindings.ok) return deepFindings;
	violations.push(...structuralFindingsToCheckItems(deepFindings.value));

	for (const location of inventory.value.records) {
		const state = await readObjectiveRecordFrontmatterState({
			storage,
			recordRelativePath: location.recordRelativePath,
		});
		if (!state.ok) return state;
		const lint = await lintObjectiveRecordFrontmatterState({
			storage,
			records: inventory.value.records,
			location,
			state: state.value,
		});
		if (!lint.ok) return lint;
		violations.push(...lint.value);
	}
	return {
		ok: true,
		value: { recordCount: inventory.value.records.length, violations },
	};
}

export function structuralFindingsToCheckItems(
	findings: readonly ObjectiveStructuralFinding[],
): ObjectiveCheckItem[] {
	return findings.map((finding) => ({
		path: finding.path,
		label: "Active Objective Root structure is well-formed",
		isPassed: false,
		severity: "error" as const,
		detail: finding.message,
	}));
}

type ObjectiveRecordFrontmatterState =
	| { type: "missing"; recordRelativePath: string; path: string }
	| { type: "unreadable"; recordRelativePath: string; path: string; message: string }
	| { type: "absent"; recordRelativePath: string; path: string; document: ObjectiveRecordDocument }
	| {
			type: "malformed";
			recordRelativePath: string;
			path: string;
			document: ObjectiveRecordDocument;
			message: string;
	  }
	| {
			type: "parsed";
			recordRelativePath: string;
			path: string;
			document: ObjectiveRecordDocument;
			frontmatter: ObjectiveRecordFrontmatter;
	  };

interface ReadObjectiveRecordFrontmatterStateOptions {
	storage: ObjectiveStorage;
	recordRelativePath: string;
}

async function readObjectiveRecordFrontmatterState(
	options: ReadObjectiveRecordFrontmatterStateOptions,
): Promise<ObjectiveStorageResult<ObjectiveRecordFrontmatterState>> {
	const read = await options.storage.readObjectiveRecordDocument(options.recordRelativePath);
	return {
		ok: true,
		value: recordFrontmatterStateFromRead({
			recordRelativePath: options.recordRelativePath,
			read,
		}),
	};
}

interface RecordFrontmatterStateFromReadOptions {
	recordRelativePath: string;
	read: ObjectiveRecordDocumentReadResult;
}

function recordFrontmatterStateFromRead(
	options: RecordFrontmatterStateFromReadOptions,
): ObjectiveRecordFrontmatterState {
	const path = `${options.recordRelativePath}/objective.md`;
	if (options.read.type === "missing") {
		return { type: "missing", recordRelativePath: options.recordRelativePath, path };
	}
	if (options.read.type === "unreadable") {
		return {
			type: "unreadable",
			recordRelativePath: options.recordRelativePath,
			path,
			message: options.read.message,
		};
	}
	return recordFrontmatterStateFromDocument({
		recordRelativePath: options.recordRelativePath,
		document: options.read.document,
	});
}

interface RecordFrontmatterStateFromDocumentOptions {
	recordRelativePath: string;
	document: ObjectiveRecordDocument;
}

function recordFrontmatterStateFromDocument(
	options: RecordFrontmatterStateFromDocumentOptions,
): ObjectiveRecordFrontmatterState {
	const path = `${options.recordRelativePath}/objective.md`;
	const frontmatterState = classifyRecordFrontmatter(options.document);
	if (frontmatterState.type === "absent") {
		return {
			type: "absent",
			recordRelativePath: options.recordRelativePath,
			path,
			document: options.document,
		};
	}
	if (frontmatterState.type === "malformed") {
		return {
			type: "malformed",
			recordRelativePath: options.recordRelativePath,
			path,
			document: options.document,
			message: frontmatterState.message,
		};
	}
	return {
		type: "parsed",
		recordRelativePath: options.recordRelativePath,
		path,
		document: options.document,
		frontmatter: frontmatterState.frontmatter,
	};
}

interface LintObjectiveRecordFrontmatterStateOptions {
	storage: ObjectiveStorage;
	records: readonly ObjectiveRecordLocation[];
	location: ObjectiveRecordLocation;
	state: ObjectiveRecordFrontmatterState;
}

async function lintObjectiveRecordFrontmatterState(
	options: LintObjectiveRecordFrontmatterStateOptions,
): Promise<ObjectiveStorageResult<readonly ObjectiveCheckItem[]>> {
	if (options.state.type === "missing") {
		return {
			ok: true,
			value: [
				objectiveMdExistsCheck({
					recordRelativePath: options.state.recordRelativePath,
					isPresent: false,
				}),
			],
		};
	}
	if (options.state.type === "unreadable") {
		return {
			ok: true,
			value: [
				objectiveMdReadableCheck({
					path: options.state.path,
					read: { type: "unreadable", message: options.state.message },
				}),
			],
		};
	}
	if (options.state.type === "absent") {
		return {
			ok: true,
			value: [
				violation(
					options.state.path,
					"objective.md declares required owner frontmatter",
					"record has no Record Frontmatter; every record requires owner",
				),
			],
		};
	}
	if (options.state.type === "malformed") {
		return {
			ok: true,
			value: [
				violation(
					options.state.path,
					"objective.md Record Frontmatter parses",
					options.state.message,
				),
			],
		};
	}

	const violations: ObjectiveCheckItem[] = [];
	const frontmatter = options.state.frontmatter;
	const location = options.location;

	if (!isValidObjectiveOwner(frontmatter.owner)) {
		violations.push(
			violation(
				options.state.path,
				"objective.md owner is a valid handle",
				`owner ${JSON.stringify(frontmatter.owner)} is not a valid owner handle`,
			),
		);
	} else if (location.layout === "owner-nested" && frontmatter.owner !== location.owner) {
		violations.push(
			violation(
				options.state.path,
				"objective.md owner matches the owner path segment",
				`frontmatter owner ${JSON.stringify(frontmatter.owner)} disagrees with directory owner ${JSON.stringify(location.owner)}`,
			),
		);
	}

	const blockedSentence = frontmatter.blocked?.trim() ?? null;
	if (blockedSentence === "") {
		violations.push(
			violation(
				options.state.path,
				"objective.md blocked sentence is non-empty",
				"blocked: is present but carries no sentence",
			),
		);
	}

	const ownLocator = location.locator;
	const seenEndpoints = new Set<string>();
	for (const edge of frontmatter.edges) {
		const endpoint = edge.objective;
		if (edge.annotation.trim() === "") {
			violations.push(
				violation(
					options.state.path,
					`objective.md edge ${endpoint} has annotation`,
					"annotation: is present but carries no sentence",
				),
			);
		}
		const endpointLocator = parseObjectiveLocatorString(endpoint);
		if (endpointLocator === null) {
			violations.push(
				violation(
					options.state.path,
					`objective.md edge ${endpoint} has a valid locator`,
					"objective: is not a full <owner>/<slug> Objective Locator",
				),
			);
			continue;
		}
		const endpointRendered = renderObjectiveLocator(endpointLocator);
		if (endpointRendered === ownLocator) {
			violations.push(
				violation(
					options.state.path,
					`objective.md edge ${endpoint} links a distinct record`,
					"edge endpoint is the record itself",
				),
			);
			continue;
		}
		if (seenEndpoints.has(endpointRendered)) {
			violations.push(
				violation(
					options.state.path,
					`objective.md edge ${endpoint} appears once`,
					"duplicate entry for the same record pair",
				),
			);
			continue;
		}
		seenEndpoints.add(endpointRendered);

		const counterpart = findRecordLocation(options.records, endpointLocator);
		if (counterpart === null) {
			violations.push(
				violation(
					options.state.path,
					`objective.md edge ${endpoint} endpoint exists`,
					"no record in the active root",
				),
			);
			continue;
		}
		const mirror = await mirrorViolation({
			storage: options.storage,
			ownLocator,
			path: options.state.path,
			endpoint: endpointRendered,
			counterpart,
		});
		if (!mirror.ok) return mirror;
		if (mirror.value !== null) violations.push(mirror.value);
	}
	return { ok: true, value: violations };
}

interface MirrorViolationOptions {
	storage: ObjectiveStorage;
	ownLocator: string;
	path: string;
	endpoint: string;
	counterpart: ObjectiveRecordLocation;
}

async function mirrorViolation(
	options: MirrorViolationOptions,
): Promise<ObjectiveStorageResult<ObjectiveCheckItem | null>> {
	const { storage, ownLocator, path, endpoint, counterpart } = options;
	const label = `objective.md edge ${endpoint} is mirrored`;
	const state = await readObjectiveRecordFrontmatterState({
		storage,
		recordRelativePath: counterpart.recordRelativePath,
	});
	if (!state.ok) return state;
	if (state.value.type === "missing") {
		return { ok: true, value: violation(path, label, "counterpart objective.md is missing") };
	}
	if (state.value.type === "unreadable") {
		return {
			ok: true,
			value: violation(
				path,
				label,
				`counterpart objective.md is unreadable: ${state.value.message}`,
			),
		};
	}
	if (state.value.type === "absent") {
		return { ok: true, value: violation(path, label, "counterpart has no Record Frontmatter") };
	}
	if (state.value.type === "malformed") {
		return {
			ok: true,
			value: violation(path, label, "counterpart Record Frontmatter is malformed"),
		};
	}
	const hasMirror = findObjectiveEdgeAnnotation(state.value.frontmatter, ownLocator) !== null;
	if (!hasMirror) {
		return {
			ok: true,
			value: violation(path, label, "counterpart does not declare the mirror edge"),
		};
	}
	return { ok: true, value: null };
}

type RecordFrontmatterClassification =
	| { type: "absent" }
	| { type: "malformed"; message: string }
	| { type: "parsed"; frontmatter: ObjectiveRecordFrontmatter };

/** Look up the annotation an edge list declares for a full locator endpoint. */
export function findObjectiveEdgeAnnotation(
	frontmatter: ObjectiveRecordFrontmatter,
	locator: string,
): string | null {
	return frontmatter.edges.find((edge) => edge.objective === locator)?.annotation ?? null;
}

function classifyRecordFrontmatter(
	document: ObjectiveRecordDocument,
): RecordFrontmatterClassification {
	const parse = document.frontmatter;
	if (parse === undefined) return { type: "absent" };
	if (parse.type === "malformed") return { type: "malformed", message: parse.message };
	return { type: "parsed", frontmatter: parse.frontmatter };
}

function violation(path: string, label: string, detail: string): ObjectiveCheckItem {
	return { path, label, isPassed: false, severity: "error", detail };
}
