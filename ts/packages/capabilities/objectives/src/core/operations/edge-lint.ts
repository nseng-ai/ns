import type { ObjectiveRecordDocument, ObjectiveRecordFrontmatter } from "../record-frontmatter.ts";
import {
	activeRecordRelativePath,
	archivedRecordRelativePath,
	isValidObjectiveSlug,
	type ObjectiveRecordDocumentReadResult,
	type ObjectiveStorage,
	type ObjectiveStorageResult,
} from "../storage.ts";
import {
	objectiveMdExistsCheck,
	objectiveMdReadableCheck,
	type ObjectiveCheckItem,
} from "./check-items.ts";

/**
 * Edge and Blocked Sentence structural linter (ADR 0025). Every violation is an
 * error: malformed frontmatter, empty blocked sentence, empty annotation,
 * invalid/dangling/self/duplicate edge slugs, and a missing mirror side. The
 * lint is frontmatter-cheap — record bodies are never interpreted — and only
 * violations are reported, so a record whose frontmatter is structurally valid
 * checks identically to one with no frontmatter at all.
 *
 * Mirror lookups resolve counterpart slugs in BOTH the active root and the
 * archive root: archiving an endpoint does not break an edge.
 */

export interface ObjectiveEdgeLintOptions {
	storage: ObjectiveStorage;
	slug: string;
	recordRelativePath: string;
	document: ObjectiveRecordDocument;
}

export async function objectiveEdgeLintChecks(
	options: ObjectiveEdgeLintOptions,
): Promise<ObjectiveStorageResult<readonly ObjectiveCheckItem[]>> {
	return await lintObjectiveRecordFrontmatterState({
		storage: options.storage,
		slug: options.slug,
		state: recordFrontmatterStateFromDocument({
			recordRelativePath: options.recordRelativePath,
			document: options.document,
		}),
	});
}

export interface ObjectiveEdgeSweepReport {
	recordCount: number;
	violations: readonly ObjectiveCheckItem[];
}

/**
 * Repo-wide edge/blocked sweep: lints every record's Record Frontmatter across
 * the active root and the archive root, reporting only violations.
 */
export async function sweepObjectiveEdgeLint(
	storage: ObjectiveStorage,
): Promise<ObjectiveStorageResult<ObjectiveEdgeSweepReport>> {
	const inventory = await storage.checkoutInventory();
	if (!inventory.ok) return inventory;
	const archivedSlugs = await storage.archivedRecordSlugs();
	if (!archivedSlugs.ok) return archivedSlugs;

	const targets = [
		...inventory.value.records.map((record) => ({
			slug: record.slug,
			recordRelativePath: activeRecordRelativePath(record.slug),
		})),
		...archivedSlugs.value.map((slug) => ({
			slug,
			recordRelativePath: archivedRecordRelativePath(slug),
		})),
	];

	const violations: ObjectiveCheckItem[] = [];
	for (const target of targets) {
		const state = await readObjectiveRecordFrontmatterState({
			storage,
			recordRelativePath: target.recordRelativePath,
		});
		if (!state.ok) return state;
		const lint = await lintObjectiveRecordFrontmatterState({
			storage,
			slug: target.slug,
			state: state.value,
		});
		if (!lint.ok) return lint;
		violations.push(...lint.value);
	}
	return { ok: true, value: { recordCount: targets.length, violations } };
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
	slug: string;
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
	if (options.state.type === "absent") return { ok: true, value: [] };
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
	if (frontmatter.blocked !== null && frontmatter.blocked.trim() === "") {
		violations.push(
			violation(
				options.state.path,
				"objective.md blocked sentence is non-empty",
				"blocked: is present but carries no sentence",
			),
		);
	}

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
		if (!isValidObjectiveSlug(endpoint)) {
			violations.push(
				violation(
					options.state.path,
					`objective.md edge ${endpoint} has a valid slug`,
					"objective: is not a single record slug",
				),
			);
			continue;
		}
		if (endpoint === options.slug) {
			violations.push(
				violation(
					options.state.path,
					`objective.md edge ${endpoint} links a distinct record`,
					"edge endpoint is the record itself",
				),
			);
			continue;
		}
		if (seenEndpoints.has(endpoint)) {
			violations.push(
				violation(
					options.state.path,
					`objective.md edge ${endpoint} appears once`,
					"duplicate entry for the same record pair",
				),
			);
			continue;
		}
		seenEndpoints.add(endpoint);

		const mirror = await mirrorViolation({
			storage: options.storage,
			slug: options.slug,
			path: options.state.path,
			endpoint,
		});
		if (!mirror.ok) return mirror;
		if (mirror.value !== null) violations.push(mirror.value);
	}
	return { ok: true, value: violations };
}

interface MirrorViolationOptions {
	storage: ObjectiveStorage;
	slug: string;
	path: string;
	endpoint: string;
}

async function mirrorViolation(
	options: MirrorViolationOptions,
): Promise<ObjectiveStorageResult<ObjectiveCheckItem | null>> {
	const { storage, slug, path, endpoint } = options;
	const counterpartPath = await storage.resolveRecordRelativePath(endpoint);
	if (!counterpartPath.ok) return counterpartPath;
	if (counterpartPath.value === null) {
		return {
			ok: true,
			value: violation(
				path,
				`objective.md edge ${endpoint} endpoint exists`,
				"no record in the active or archive root",
			),
		};
	}

	const label = `objective.md edge ${endpoint} is mirrored`;
	const counterpart = await readObjectiveRecordFrontmatterState({
		storage,
		recordRelativePath: counterpartPath.value,
	});
	if (!counterpart.ok) return counterpart;
	if (counterpart.value.type === "missing") {
		return { ok: true, value: violation(path, label, "counterpart objective.md is missing") };
	}
	if (counterpart.value.type === "unreadable") {
		return {
			ok: true,
			value: violation(
				path,
				label,
				`counterpart objective.md is unreadable: ${counterpart.value.message}`,
			),
		};
	}
	if (counterpart.value.type === "absent") {
		return {
			ok: true,
			value: violation(path, label, "counterpart has no Record Frontmatter"),
		};
	}
	if (counterpart.value.type === "malformed") {
		return {
			ok: true,
			value: violation(path, label, "counterpart Record Frontmatter is malformed"),
		};
	}
	const hasMirror = findObjectiveEdgeAnnotation(counterpart.value.frontmatter, slug) !== null;
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

export function findObjectiveEdgeAnnotation(
	frontmatter: ObjectiveRecordFrontmatter,
	slug: string,
): string | null {
	return frontmatter.edges.find((edge) => edge.objective === slug)?.annotation ?? null;
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
