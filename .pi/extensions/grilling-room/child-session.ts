import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import {
	createAgentSession,
	DefaultResourceLoader,
	SessionManager,
	type ExtensionAPI,
	type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { createEmptyGrillingMap, createUpdateGrillingMapTool, type GrillingMap, type GrillingMapStore } from "./grilling-map.ts";
import { AGENT_DIR } from "./paths.ts";
import { type ReportMetadata, writeReport } from "./report.ts";

export interface GrillingRoomRuntime {
	topic: string;
	runDir: string;
	briefPath: string;
	reportPath: string;
	nativeSessionPath: string;
	session: AgentSession;
	mapStore: GrillingMapStore;
	reportMetadata: ReportMetadata;
	isResume: boolean;
}

export interface CreateGrillingRoomRuntimeOptions {
	topic: string;
	runDir: string;
	briefPath: string;
	reportPath: string;
	existingSessionPath?: string;
}

export const FINALIZE_REPORT_PROMPT = `Finalize the Grilling Room report.

Ensure report.md is standalone, includes the native session path, references brief.md and all important artifact files under the run directory, and clearly records decisions reached, unresolved questions, and recommended next steps.`;

export function buildKickoffPrompt(briefPath: string): string {
	return [
		"Start the Grilling Room interview.",
		"",
		`Read or use the brief at ${briefPath}.`,
		"Identify the first unresolved decision, update the grilling map, and ask exactly one question with your recommended answer.",
	].join("\n");
}

export async function createGrillingRoomRuntime(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	options: CreateGrillingRoomRuntimeOptions,
): Promise<GrillingRoomRuntime> {
	const sessionManager = options.existingSessionPath
		? SessionManager.open(options.existingSessionPath)
		: SessionManager.create(ctx.cwd);
	const nativeSessionPath = sessionManager.getSessionFile() ?? "(ephemeral child session)";

	const reportMetadata: ReportMetadata = {
		topic: options.topic,
		runDir: options.runDir,
		briefPath: options.briefPath,
		reportPath: options.reportPath,
		nativeSessionPath,
		status: "Draft",
	};

	const mapStore: GrillingMapStore = {
		map: readLatestGrillingMap(sessionManager) ?? createEmptyGrillingMap(options.topic),
		writeReport: (map) => writeReport(reportMetadata, map),
	};

	const grillMeSkillPath = await findGrillMeSkillPath(ctx.cwd);
	const additionalSkillPaths = [grillMeSkillPath, ...getExtraSkillPaths()].filter((value): value is string => Boolean(value));

	const loader = new DefaultResourceLoader({
		cwd: ctx.cwd,
		agentDir: AGENT_DIR,
		noExtensions: true,
		noPromptTemplates: true,
		noSkills: true,
		additionalSkillPaths,
		systemPromptOverride: () =>
			buildGrillerSystemPrompt({
				runDir: options.runDir,
				briefPath: options.briefPath,
				reportPath: options.reportPath,
			}),
	});
	await loader.reload();

	const { session } = await createAgentSession({
		cwd: ctx.cwd,
		agentDir: AGENT_DIR,
		resourceLoader: loader,
		sessionManager,
		model: ctx.model,
		modelRegistry: ctx.modelRegistry,
		thinkingLevel: pi.getThinkingLevel(),
		tools: ["read", "bash", "edit", "write", "grep", "find", "ls", "update_grilling_map"],
		customTools: [createUpdateGrillingMapTool(mapStore)],
	});

	session.setSessionName(`[grilling] ${options.topic}`);
	reportMetadata.nativeSessionPath = session.sessionFile ?? nativeSessionPath;
	if (!options.existingSessionPath || !(await pathExists(options.reportPath))) {
		await writeReport(reportMetadata, mapStore.map);
	}

	return {
		topic: options.topic,
		runDir: options.runDir,
		briefPath: options.briefPath,
		reportPath: options.reportPath,
		nativeSessionPath: reportMetadata.nativeSessionPath,
		session,
		mapStore,
		reportMetadata,
		isResume: Boolean(options.existingSessionPath),
	};
}

function readLatestGrillingMap(sessionManager: SessionManager): GrillingMap | undefined {
	const branch = sessionManager.getBranch();
	for (let index = branch.length - 1; index >= 0; index -= 1) {
		const entry = branch[index];
		if (entry.type !== "message" || entry.message.role !== "toolResult") continue;
		if (entry.message.toolName !== "update_grilling_map") continue;
		const map = (entry.message.details as { map?: GrillingMap } | undefined)?.map;
		if (map && Array.isArray(map.asked) && Array.isArray(map.projected) && Array.isArray(map.notes)) {
			return map;
		}
	}
	return undefined;
}

function buildGrillerSystemPrompt(paths: { runDir: string; briefPath: string; reportPath: string }): string {
	return `You are in Grilling Room, a focused subharness for interrogating a plan, design, requirement, debugging narrative, or other context-under-review.

Core contract:
- Interview the user relentlessly until shared understanding is reached.
- Ask exactly one question at a time.
- For every question, provide your recommended answer.
- Walk down the design tree and resolve dependencies between decisions one-by-one.
- If a question can be answered by exploring the codebase or available artifacts, explore instead of asking.
- Maintain the grilling map using update_grilling_map whenever the current question, asked history, decisions, notes, or projected upcoming questions change.
- Keep report.md useful as a standalone artifact. Prefer writing artifacts under ${paths.runDir}.
- Do not modify project files unless the user explicitly asks; this is advisory in the prototype.

Important paths:
- Run artifact directory: ${paths.runDir}
- Brief: ${paths.briefPath}
- Report: ${paths.reportPath}

Start by reading or using the brief, identifying the first unresolved decision, updating the grilling map, and asking one question.
`;
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function findGrillMeSkillPath(cwd: string): Promise<string | undefined> {
	for (const candidate of candidateGrillMeSkillPaths(cwd)) {
		try {
			await access(candidate);
			return candidate;
		} catch {
			// Keep checking known skill locations.
		}
	}
	return undefined;
}

function candidateGrillMeSkillPaths(cwd: string): string[] {
	const candidates: string[] = [];
	let current = path.resolve(cwd);
	while (true) {
		candidates.push(path.join(current, ".agents", "skills", "grill-me", "SKILL.md"));
		candidates.push(path.join(current, "skills", "grill-me", "SKILL.md"));
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	candidates.push(path.join(AGENT_DIR, "skills", "grill-me", "SKILL.md"));
	candidates.push(path.join(homedir(), ".agents", "skills", "grill-me", "SKILL.md"));
	return candidates;
}

function getExtraSkillPaths(): string[] {
	const raw = process.env.PI_GRILLING_ROOM_EXTRA_SKILLS;
	if (!raw) return [];
	return raw
		.split(path.delimiter)
		.map((item) => item.trim())
		.filter(Boolean);
}
