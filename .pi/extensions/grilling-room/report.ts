import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GrillingMap } from "./grilling-map.ts";

export interface BriefMetadata {
	focus: string;
	cwd: string;
	branch: string;
	parentSessionPath?: string;
}

export interface ReportMetadata {
	topic: string;
	runDir: string;
	briefPath: string;
	reportPath: string;
	nativeSessionPath: string;
	status: "Draft" | "Final" | string;
}

export interface ParsedReport {
	topic: string;
	nativeSessionPath?: string;
	status?: string;
}

export function topicFromFocus(focus: string): string {
	const firstLine = focus.trim().split(/\r?\n/)[0]?.trim() ?? "";
	if (firstLine.length === 0) return "Untitled grilling session";
	return firstLine.length > 96 ? `${firstLine.slice(0, 93)}...` : firstLine;
}

export async function writeBrief(briefPath: string, metadata: BriefMetadata): Promise<void> {
	await mkdir(path.dirname(briefPath), { recursive: true });

	// TODO(subharness): Replace this parent-assistant/user-authored brief path with
	// a hidden SDK extraction agent that reads ctx.sessionManager.getBranch(),
	// reconstructs the context-under-review, and writes brief.md without adding
	// extraction chatter to the parent transcript.
	await writeFile(
		briefPath,
		[
			"# Grilling Brief",
			"",
			"## User Focus",
			"",
			metadata.focus.trim() || "(no focus supplied)",
			"",
			"## Context Under Review",
			"",
			"This prototype brief uses the command text as the context under review.",
			"If relevant parent-session details matter, they should be included in the focus text supplied to `/harness:griller`.",
			"",
			"## Parent Session",
			"",
			`- CWD: \`${metadata.cwd}\``,
			`- Parent session: \`${metadata.parentSessionPath ?? "unknown"}\``,
			`- Branch: \`${metadata.branch}\``,
			"",
			"## Notes",
			"",
			"This prototype brief was generated from the command text and parent-session metadata. Future versions should use a hidden extraction agent to reconstruct a richer brief from the parent branch without polluting the parent transcript.",
			"",
		].join("\n"),
		"utf8",
	);
}

export async function writeReport(metadata: ReportMetadata, map: GrillingMap): Promise<void> {
	await mkdir(path.dirname(metadata.reportPath), { recursive: true });
	const artifacts = await listReferencedArtifacts(metadata.runDir);
	await writeFile(metadata.reportPath, buildReportMarkdown(metadata, map, artifacts), "utf8");
}

export async function reportExists(reportPath: string): Promise<boolean> {
	try {
		await access(reportPath);
		return true;
	} catch {
		return false;
	}
}

export async function parseReport(reportPath: string): Promise<ParsedReport> {
	const content = await readFile(reportPath, "utf8");
	const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
	const topic = heading?.replace(/^Grilling Room Report:\s*/i, "") || path.basename(path.dirname(reportPath));
	const nativeSessionPath =
		content.match(/^Native Pi session:\s*`([^`]+)`\s*$/m)?.[1] ??
		content.match(/^Native Pi session:\s*(.+?)\s*$/m)?.[1]?.replace(/^`|`$/g, "");
	const status = content.match(/^## Status\s*\n+([^\n]+)/m)?.[1]?.trim();
	return { topic, nativeSessionPath, status };
}

function buildReportMarkdown(metadata: ReportMetadata, map: GrillingMap, artifacts: string[]): string {
	return [
		`# Grilling Room Report: ${metadata.topic}`,
		"",
		"## Session",
		"",
		`Native Pi session: \`${metadata.nativeSessionPath}\``,
		`Artifact directory: \`${metadata.runDir}\``,
		"Initial brief: [`brief.md`](brief.md)",
		"",
		"## Status",
		"",
		metadata.status,
		"",
		"## Context Under Review",
		"",
		map.topic ? map.topic : "See [`brief.md`](brief.md) for the initial context under review.",
		"",
		"## Asked Questions / Decisions",
		"",
		formatAsked(map),
		"",
		"## Current Question",
		"",
		map.currentQuestion ?? "(none recorded yet)",
		"",
		"## Projected Upcoming Questions",
		"",
		formatProjected(map),
		"",
		"## Notes",
		"",
		formatNotes(map),
		"",
		"## Referenced Artifacts",
		"",
		"- [`brief.md`](brief.md) — initial briefing document.",
		...artifacts.map((artifact) => `- [\`${artifact}\`](${encodeURI(artifact)}) — run artifact.`),
		"",
		`_Last host map update: ${map.updatedAt ?? new Date().toISOString()}_`,
		"",
	].join("\n");
}

async function listReferencedArtifacts(runDir: string): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(runDir, { withFileTypes: true });
	} catch {
		return [];
	}

	return entries
		.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
		.filter((name) => name !== "brief.md" && name !== "report.md")
		.sort((left, right) => left.localeCompare(right));
}

function formatAsked(map: GrillingMap): string {
	if (map.asked.length === 0) return "(none recorded yet)";
	return map.asked
		.map((item, index) => {
			const lines = [`${index + 1}. ${item.question}`];
			if (item.recommendedAnswer) lines.push(`   - Recommended answer: ${item.recommendedAnswer}`);
			if (item.userAnswerSummary) lines.push(`   - User answer summary: ${item.userAnswerSummary}`);
			if (item.decision) lines.push(`   - Decision: ${item.decision}`);
			if (item.status) lines.push(`   - Status: ${item.status}`);
			return lines.join("\n");
		})
		.join("\n");
}

function formatProjected(map: GrillingMap): string {
	if (map.projected.length === 0) return "(none recorded yet)";
	return map.projected
		.map((item) => {
			const suffix = [item.priority ? `priority: ${item.priority}` : undefined, item.dependsOn ? `depends on: ${item.dependsOn}` : undefined]
				.filter(Boolean)
				.join(", ");
			const lines = [`- ${item.question}${suffix ? ` (${suffix})` : ""}`];
			if (item.rationale) lines.push(`  - Rationale: ${item.rationale}`);
			return lines.join("\n");
		})
		.join("\n");
}

function formatNotes(map: GrillingMap): string {
	if (map.notes.length === 0) return "(none recorded yet)";
	return map.notes.map((note) => `- ${note}`).join("\n");
}
