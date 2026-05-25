import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

export interface AskedQuestion {
	question: string;
	recommendedAnswer?: string;
	userAnswerSummary?: string;
	decision?: string;
	status?: "answered" | "deferred" | "superseded";
}

export interface ProjectedQuestion {
	question: string;
	rationale?: string;
	dependsOn?: string;
	priority?: "high" | "medium" | "low";
}

export interface GrillingMap {
	topic?: string;
	currentQuestion?: string;
	asked: AskedQuestion[];
	projected: ProjectedQuestion[];
	notes: string[];
	updatedAt?: string;
}

export interface GrillingMapStore {
	map: GrillingMap;
	writeReport: (map: GrillingMap) => Promise<void>;
	onChange?: (map: GrillingMap) => void;
}

const AskedQuestionSchema = Type.Object({
	question: Type.String(),
	recommendedAnswer: Type.Optional(Type.String()),
	userAnswerSummary: Type.Optional(Type.String()),
	decision: Type.Optional(Type.String()),
	status: Type.Optional(StringEnum(["answered", "deferred", "superseded"] as const)),
});

const ProjectedQuestionSchema = Type.Object({
	question: Type.String(),
	rationale: Type.Optional(Type.String()),
	dependsOn: Type.Optional(Type.String()),
	priority: Type.Optional(StringEnum(["high", "medium", "low"] as const)),
});

export const UpdateGrillingMapParamsSchema = Type.Object({
	topic: Type.Optional(Type.String()),
	currentQuestion: Type.Optional(Type.String()),
	asked: Type.Optional(Type.Array(AskedQuestionSchema)),
	projected: Type.Optional(Type.Array(ProjectedQuestionSchema)),
	notes: Type.Optional(Type.Array(Type.String())),
});

export type UpdateGrillingMapParams = Static<typeof UpdateGrillingMapParamsSchema>;

export function createEmptyGrillingMap(topic?: string): GrillingMap {
	return {
		topic,
		asked: [],
		projected: [],
		notes: [],
		updatedAt: new Date().toISOString(),
	};
}

export function applyGrillingMapUpdate(current: GrillingMap, params: UpdateGrillingMapParams): GrillingMap {
	return {
		topic: params.topic ?? current.topic,
		currentQuestion: params.currentQuestion ?? current.currentQuestion,
		asked: params.asked !== undefined ? params.asked : current.asked,
		projected: params.projected !== undefined ? params.projected : current.projected,
		notes: params.notes !== undefined ? params.notes : current.notes,
		updatedAt: new Date().toISOString(),
	};
}

export function createUpdateGrillingMapTool(store: GrillingMapStore) {
	return defineTool({
		name: "update_grilling_map",
		label: "Update Grilling Map",
		description:
			"Update the Grilling Room's structured map: current question, asked-question history, decisions, notes, and projected upcoming questions.",
		promptSnippet: "Maintain the Grilling Room map for the parent-hosted interview UI and live report.",
		promptGuidelines: [
			"Use update_grilling_map whenever the current grilling question, asked history, decisions, notes, or projected upcoming questions change.",
			"Use update_grilling_map with replace-all semantics for asked and projected arrays; include the complete desired arrays when changing them.",
		],
		parameters: UpdateGrillingMapParamsSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params) {
			store.map = applyGrillingMapUpdate(store.map, params);
			await store.writeReport(store.map);
			store.onChange?.(store.map);

			const askedCount = store.map.asked.length;
			const projectedCount = store.map.projected.length;
			return {
				content: [
					{
						type: "text" as const,
						text: `Updated grilling map (${askedCount} asked, ${projectedCount} projected).`,
					},
				],
				details: { map: store.map },
			};
		},
		renderCall(args, theme) {
			const current = args.currentQuestion ? ` current: ${args.currentQuestion}` : "";
			return new Text(theme.fg("toolTitle", theme.bold("update_grilling_map")) + theme.fg("dim", current), 0, 0);
		},
		renderResult(result, _options, theme) {
			const map = (result.details as { map?: GrillingMap } | undefined)?.map;
			const text = map
				? `✓ map updated: ${map.asked.length} asked, ${map.projected.length} projected`
				: "✓ map updated";
			return new Text(theme.fg("success", text), 0, 0);
		},
	});
}
