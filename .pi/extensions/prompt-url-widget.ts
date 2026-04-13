import { DynamicBorder, type ExtensionAPI, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";

const PR_PROMPT_PATTERN = /^\s*You are given one or more GitHub PR URLs:\s*(\S+)/im;
const ISSUE_PROMPT_PATTERN = /^\s*Analyze GitHub issue\(s\):\s*(\S+)/im;
const PR_URL_PATTERN = /https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/i;
const ISSUE_URL_PATTERN = /https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/issues\/\d+/i;

type PromptMatch = {
	kind: "pr" | "issue";
	url: string;
};

type GhMetadata = {
	title?: string;
	author?: {
		login?: string;
		name?: string | null;
	};
};

function extractPromptMatch(prompt: string): PromptMatch | undefined {
	const prMatch = prompt.match(PR_PROMPT_PATTERN);
	if (prMatch?.[1]) {
		return { kind: "pr", url: prMatch[1].trim() };
	}

	const issueMatch = prompt.match(ISSUE_PROMPT_PATTERN);
	if (issueMatch?.[1]) {
		return { kind: "issue", url: issueMatch[1].trim() };
	}

	return undefined;
}

function extractUrlMatch(text: string): PromptMatch | undefined {
	const prUrl = text.match(PR_URL_PATTERN)?.[0]?.trim();
	if (prUrl) {
		return { kind: "pr", url: prUrl };
	}

	const issueUrl = text.match(ISSUE_URL_PATTERN)?.[0]?.trim();
	if (issueUrl) {
		return { kind: "issue", url: issueUrl };
	}

	return undefined;
}

async function inferCurrentBranchPrMatch(pi: ExtensionAPI): Promise<PromptMatch | undefined> {
	try {
		const result = await pi.exec("gh", ["pr", "view", "--json", "url"]);
		if (result.code !== 0 || !result.stdout) return undefined;
		const payload = JSON.parse(result.stdout) as { url?: string };
		const url = payload.url?.trim();
		if (!url) return undefined;
		return { kind: "pr", url };
	} catch {
		return undefined;
	}
}

async function fetchGhMetadata(
	pi: ExtensionAPI,
	kind: PromptMatch["kind"],
	url: string,
): Promise<GhMetadata | undefined> {
	const args =
		kind === "pr" ? ["pr", "view", url, "--json", "title,author"] : ["issue", "view", url, "--json", "title,author"];

	try {
		const result = await pi.exec("gh", args);
		if (result.code !== 0 || !result.stdout) return undefined;
		return JSON.parse(result.stdout) as GhMetadata;
	} catch {
		return undefined;
	}
}

function formatAuthor(author?: GhMetadata["author"]): string | undefined {
	if (!author) return undefined;
	const name = author.name?.trim();
	const login = author.login?.trim();
	if (name && login) return `${name} (@${login})`;
	if (login) return `@${login}`;
	if (name) return name;
	return undefined;
}

export default function promptUrlWidgetExtension(pi: ExtensionAPI) {
	const setWidget = (ctx: ExtensionContext, match: PromptMatch, title?: string, authorText?: string) => {
		ctx.ui.setWidget("prompt-url", (_tui, thm) => {
			const titleText = title ? thm.fg("accent", title) : thm.fg("accent", match.url);
			const authorLine = authorText ? thm.fg("muted", authorText) : undefined;
			const urlLine = thm.fg("dim", match.url);

			const lines = [titleText];
			if (authorLine) lines.push(authorLine);
			lines.push(urlLine);

			const container = new Container();
			container.addChild(new DynamicBorder((s: string) => thm.fg("muted", s)));
			container.addChild(new Text(lines.join("\n"), 1, 0));
			return container;
		});
	};

	const applySessionName = (ctx: ExtensionContext, match: PromptMatch, title?: string) => {
		const label = match.kind === "pr" ? "PR" : "Issue";
		const trimmedTitle = title?.trim();
		const fallbackName = `${label}: ${match.url}`;
		const desiredName = trimmedTitle ? `${label}: ${trimmedTitle} (${match.url})` : fallbackName;
		const currentName = pi.getSessionName()?.trim();
		if (!currentName) {
			pi.setSessionName(desiredName);
			return;
		}
		if (currentName === match.url || currentName === fallbackName) {
			pi.setSessionName(desiredName);
		}
	};

	const applyMatch = (ctx: ExtensionContext, match: PromptMatch) => {
		if (ctx.hasUI) {
			setWidget(ctx, match);
		}
		applySessionName(ctx, match);
		void fetchGhMetadata(pi, match.kind, match.url).then((meta) => {
			const title = meta?.title?.trim();
			const authorText = formatAuthor(meta?.author);
			if (ctx.hasUI) {
				setWidget(ctx, match, title, authorText);
			}
			applySessionName(ctx, match, title);
		});
	};

	pi.registerCommand("set-gh-url", {
		description: "Set GitHub PR/issue URL for the widget. No argument uses current branch PR.",
		handler: async (args, ctx) => {
			const trimmedArgs = args.trim();
			const match = trimmedArgs ? extractUrlMatch(trimmedArgs) : await inferCurrentBranchPrMatch(pi);
			if (!match) {
				if (!ctx.hasUI) return;
				const message =
					trimmedArgs.length > 0
						? "No GitHub PR or issue URL found in command arguments."
						: "No PR associated with the current branch. Pass a GitHub PR/issue URL.";
				ctx.ui.notify(message, "warning");
				return;
			}

			applyMatch(ctx, match);
			if (ctx.hasUI) {
				const kindLabel = match.kind === "pr" ? "PR" : "issue";
				ctx.ui.notify(`Tracking ${kindLabel}: ${match.url}`, "info");
			}
		},
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (!ctx.hasUI) return;
		const match = extractPromptMatch(event.prompt);
		if (!match) {
			return;
		}

		applyMatch(ctx, match);
	});

	pi.on("session_switch", async (_event, ctx) => {
		rebuildFromSession(ctx);
	});

	const getUserText = (content: string | { type: string; text?: string }[] | undefined): string => {
		if (!content) return "";
		if (typeof content === "string") return content;
		return (
			content
				.filter((block): block is { type: "text"; text: string } => block.type === "text")
				.map((block) => block.text)
				.join("\n") ?? ""
		);
	};

	const rebuildFromSession = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;

		const entries = ctx.sessionManager.getEntries();
		const lastMatch = [...entries].reverse().find((entry) => {
			if (entry.type !== "message" || entry.message.role !== "user") return false;
			const text = getUserText(entry.message.content);
			return !!extractPromptMatch(text);
		});

		const content =
			lastMatch?.type === "message" && lastMatch.message.role === "user" ? lastMatch.message.content : undefined;
		const text = getUserText(content);
		const match = text ? extractPromptMatch(text) : undefined;
		if (!match) {
			ctx.ui.setWidget("prompt-url", undefined);
			return;
		}

		applyMatch(ctx, match);
	};

	pi.on("session_start", async (_event, ctx) => {
		rebuildFromSession(ctx);
	});
}
