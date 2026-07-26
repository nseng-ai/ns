import type { Caps } from "@nseng-ai/clinkr";
import {
	cell,
	paint,
	renderTable,
	type Cell,
	type Column,
	type Intent,
} from "@nseng-ai/foundation/cli-theme";
import type { z } from "zod";

import type { placementProvisionSchema } from "./result-schemas.ts";

export type PlacementProvision = z.infer<typeof placementProvisionSchema>;

interface ProvisionOperationEntry<Action extends string> {
	readonly action: Action;
	readonly message: string | null;
}

type ProvisionOperationSummary<
	Entry,
	CountActionByField extends Readonly<Record<string, string>>,
> = {
	readonly entries: Entry[];
} & {
	readonly [Field in keyof CountActionByField]: number;
};

export interface ProvisionOperationActionPresentation {
	readonly label: string;
	readonly intent: Intent;
}

export interface ProvisionOperationColumn<Entry> extends Column {
	readonly renderCell: (entry: Entry, caps: Caps) => Cell;
}

export interface ProvisionOperationSummaryFact {
	readonly label: string;
	readonly count: number;
	readonly intent: Intent;
}

interface RenderProvisionOperationDetailsOptions<
	Action extends string,
	Entry extends ProvisionOperationEntry<Action>,
> {
	readonly caps: Caps;
	readonly detailLines: readonly string[];
	readonly entries: readonly Entry[];
	readonly columns: readonly ProvisionOperationColumn<Entry>[];
	readonly actionPresentationByAction: Readonly<
		Record<Action, ProvisionOperationActionPresentation>
	>;
	readonly summaryFacts: readonly ProvisionOperationSummaryFact[];
}

export function summarizeProvisionOperationEntries<
	Action extends string,
	Entry extends ProvisionOperationEntry<Action>,
	const CountActionByField extends Readonly<Record<string, Action>>,
>(
	entries: readonly Entry[],
	countActionByField: CountActionByField,
): ProvisionOperationSummary<Entry, CountActionByField> {
	const counts = Object.fromEntries(
		Object.entries(countActionByField).map(([field, action]) => [
			field,
			entries.filter((entry) => entry.action === action).length,
		]),
	) as { readonly [Field in keyof CountActionByField]: number };
	return { entries: entries.map((entry) => ({ ...entry })), ...counts };
}

/** Shared details → table → per-row note → summary pipeline for provision commands. */
export function renderProvisionOperationDetails<
	Action extends string,
	Entry extends ProvisionOperationEntry<Action>,
>(options: RenderProvisionOperationDetailsOptions<Action, Entry>): string {
	const lines = [...options.detailLines];
	if (options.entries.length > 0) lines.push(...renderProvisionOperationTable(options));
	lines.push("", renderProvisionOperationSummary(options.caps, options.summaryFacts));
	return lines.join("\n");
}

function renderProvisionOperationTable<
	Action extends string,
	Entry extends ProvisionOperationEntry<Action>,
>(options: RenderProvisionOperationDetailsOptions<Action, Entry>): string[] {
	const { actionPresentationByAction, caps, columns, entries } = options;
	const tableLines = renderTable({
		caps,
		columns: [{ header: "ACTION", width: "auto" }, ...columns],
		rows: entries.map((entry) => {
			const actionPresentation = actionPresentationByAction[entry.action];
			return [
				cell(
					paint(caps, actionPresentation.intent, actionPresentation.label),
					actionPresentation.label,
				),
				...columns.map((column) => column.renderCell(entry, caps)),
			];
		}),
	});
	const lines: string[] = [tableLines[0] ?? ""];
	const rowLines = tableLines.slice(1);
	entries.forEach((entry, index) => {
		const rowLine = rowLines[index];
		if (rowLine !== undefined) lines.push(rowLine);
		if (entry.message !== null) lines.push(`  ${paint(caps, "muted", "note:")} ${entry.message}`);
	});
	return lines;
}

function renderProvisionOperationSummary(
	caps: Caps,
	facts: readonly ProvisionOperationSummaryFact[],
): string {
	const renderedFacts = facts.map((fact) =>
		paint(caps, fact.count === 0 ? "muted" : fact.intent, `${fact.label} ${fact.count}`),
	);
	return `${paint(caps, "muted", "Summary:")} ${renderedFacts.join(paint(caps, "muted", "; "))}`;
}

/**
 * Human lines for placement provisioning. Empty when nothing was declared or
 * nothing happened, so existing placement output stays byte-stable. Paths
 * only; provisioned file contents never render.
 */
export function renderPlacementProvisionLines(provision: PlacementProvision | null): string[] {
	if (provision === null) return [];
	return [
		...provision.copied.map((copy) => `Provisioned: ${copy.path} -> ${copy.slotName}`),
		...provision.notices.map((notice) => `provision note: ${notice.message}`),
	];
}
