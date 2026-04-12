import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";

type Objective = {
	number: number;
	title: string;
	state: string;
	updated_at: string;
};

type ObjectiveListResponse = {
	objectives: Objective[];
	count: number;
	success: boolean;
};

type ObjectiveListMessageDetails = {
	objectives: Objective[];
	count: number;
	fetchedAt: number;
	command: string;
	repoBaseUrl?: string;
	error?: string;
};

const COMMAND = "twerk objective json list";
const STATUS_KEY = "objective-list";
const CUSTOM_TYPE = "objective-list";

function normalizeState(state: string): string {
	return state.trim().toLowerCase();
}

function formatRelativeTime(timestamp: string): string {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return timestamp;
	}

	const diffMs = date.getTime() - Date.now();
	const diffSeconds = Math.round(diffMs / 1000);
	const absSeconds = Math.abs(diffSeconds);

	if (absSeconds < 30) {
		return "just now";
	}

	const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
		["year", 60 * 60 * 24 * 365],
		["month", 60 * 60 * 24 * 30],
		["week", 60 * 60 * 24 * 7],
		["day", 60 * 60 * 24],
		["hour", 60 * 60],
		["minute", 60],
	];

	const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
	for (const [unit, secondsPerUnit] of units) {
		if (absSeconds >= secondsPerUnit) {
			return formatter.format(Math.round(diffSeconds / secondsPerUnit), unit);
		}
	}

	return formatter.format(diffSeconds, "second");
}

function buildSummary(details: ObjectiveListMessageDetails): string {
	if (details.error) {
		return `Failed to load objectives: ${details.error}`;
	}

	const count = details.count;
	return `Loaded ${count} objective${count === 1 ? "" : "s"}.`;
}

function parseObjectiveList(stdout: string): ObjectiveListResponse {
	const parsed = JSON.parse(stdout) as Partial<ObjectiveListResponse>;
	if (!parsed || typeof parsed !== "object") {
		throw new Error("Command did not return a JSON object.");
	}
	if (parsed.success !== true) {
		throw new Error("Command reported success=false.");
	}
	if (!Array.isArray(parsed.objectives)) {
		throw new Error("Command output did not include an objectives array.");
	}

	const objectives = parsed.objectives.map((objective, index) => {
		if (!objective || typeof objective !== "object") {
			throw new Error(`Objective ${index + 1} was not an object.`);
		}

		const candidate = objective as Partial<Objective>;
		if (
			typeof candidate.number !== "number" ||
			typeof candidate.title !== "string" ||
			typeof candidate.state !== "string" ||
			typeof candidate.updated_at !== "string"
		) {
			throw new Error(`Objective ${index + 1} had an unexpected shape.`);
		}

		return {
			number: candidate.number,
			title: candidate.title,
			state: candidate.state,
			updated_at: candidate.updated_at,
		};
	});

	return {
		objectives,
		count: typeof parsed.count === "number" ? parsed.count : objectives.length,
		success: true,
	};
}

function osc8Link(text: string, url: string): string {
	return `\u001b]8;;${url}\u001b\\${text}\u001b]8;;\u001b\\`;
}

function parseGithubRepoBaseUrl(remote: string): string | undefined {
	const trimmed = remote.trim();
	if (trimmed.length === 0) {
		return undefined;
	}

	const withoutGitSuffix = trimmed.endsWith(".git") ? trimmed.slice(0, -4) : trimmed;

	const httpsMatch = withoutGitSuffix.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
	if (httpsMatch) {
		return `https://github.com/${httpsMatch[1]}/${httpsMatch[2]}`;
	}

	const sshMatch = withoutGitSuffix.match(/^(?:ssh:\/\/)?git@github\.com[:/]([^/]+)\/([^/]+)$/);
	if (sshMatch) {
		return `https://github.com/${sshMatch[1]}/${sshMatch[2]}`;
	}

	return undefined;
}

async function getGithubRepoBaseUrl(pi: ExtensionAPI): Promise<string | undefined> {
	const result = await pi.exec("git", ["remote", "get-url", "origin"], {
		timeout: 5_000,
	});
	if (result.code !== 0) {
		return undefined;
	}
	return parseGithubRepoBaseUrl(result.stdout);
}

function renderObjective(
	objective: Objective,
	expanded: boolean,
	theme: any,
	repoBaseUrl?: string,
): string {
	const state = normalizeState(objective.state);
	const isOpen = state === "open";
	const badgeText = isOpen ? "● open" : state === "closed" ? "○ closed" : `• ${state}`;
	const badgeColor = isOpen ? "success" : state === "closed" ? "muted" : "warning";
	const issueUrl = repoBaseUrl ? `${repoBaseUrl}/issues/${objective.number}` : undefined;
	const plainNumber = theme.fg("accent", `#${objective.number}`);
	const number = issueUrl ? osc8Link(plainNumber, issueUrl) : plainNumber;
	const badge = theme.fg(badgeColor, badgeText);
	const updated = theme.fg("dim", formatRelativeTime(objective.updated_at));
	const updatedLabel = theme.fg("muted", "updated ");

	let text = `${number} ${badge}\n${theme.bold(objective.title)}\n${updatedLabel}${updated}`;
	if (expanded) {
		text += `\n${theme.fg("dim", objective.updated_at)}`;
		if (issueUrl) {
			text += `\n${theme.fg("dim", issueUrl)}`;
		}
	}
	return text;
}

export default function objectiveListExtension(pi: ExtensionAPI) {
	pi.registerMessageRenderer(CUSTOM_TYPE, (message, { expanded }, theme) => {
		const details = message.details as ObjectiveListMessageDetails | undefined;
		const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));

		if (!details) {
			box.addChild(new Text(message.content || "Objective list", 0, 0));
			return box;
		}

		let text = theme.fg("toolTitle", "Objective list");
		text += theme.fg("dim", ` · ${details.count} total`);

		if (details.error) {
			text += `\n\n${theme.fg("error", details.error)}`;
		} else if (details.objectives.length === 0) {
			text += `\n\n${theme.fg("muted", "No objectives found.")}`;
		} else {
			for (const objective of details.objectives) {
				text += `\n\n${renderObjective(objective, expanded, theme, details.repoBaseUrl)}`;
			}
		}

		text += `\n\n${theme.fg("dim", `Source: ${details.command}`)}`;
		if (expanded) {
			text += `\n${theme.fg("dim", `Fetched ${new Date(details.fetchedAt).toLocaleString()}`)}`;
		}

		box.addChild(new Text(text, 0, 0));
		return box;
	});

	pi.registerCommand("objective-list", {
		description: "List twerk objectives with a custom renderer",
		handler: async (_args, ctx) => {
			if (ctx.hasUI) {
				ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "Loading objectives…"));
			}

			try {
				const [listResult, repoBaseUrl] = await Promise.all([
					pi.exec("twerk", ["objective", "json", "list"], {
						timeout: 15_000,
					}),
					getGithubRepoBaseUrl(pi),
				]);

				if (listResult.code !== 0) {
					throw new Error(listResult.stderr.trim() || `Command exited with code ${listResult.code}.`);
				}

				const payload = parseObjectiveList(listResult.stdout);
				const details: ObjectiveListMessageDetails = {
					objectives: payload.objectives,
					count: payload.count,
					fetchedAt: Date.now(),
					command: COMMAND,
					repoBaseUrl,
				};

				pi.sendMessage({
					customType: CUSTOM_TYPE,
					content: buildSummary(details),
					display: true,
					details,
				});

				if (ctx.hasUI) {
					ctx.ui.notify(`Loaded ${payload.count} objective${payload.count === 1 ? "" : "s"}.`, "info");
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const details: ObjectiveListMessageDetails = {
					objectives: [],
					count: 0,
					fetchedAt: Date.now(),
					command: COMMAND,
					error: message,
				};

				pi.sendMessage({
					customType: CUSTOM_TYPE,
					content: buildSummary(details),
					display: true,
					details,
				});

				if (ctx.hasUI) {
					ctx.ui.notify(`Failed to load objectives: ${message}`, "error");
				}
			} finally {
				if (ctx.hasUI) {
					ctx.ui.setStatus(STATUS_KEY, undefined);
				}
			}
		},
	});
}
