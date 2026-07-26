import { Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";

/**
 * Stack-view test themes. The tagging theme additionally tags background colors
 * so the selected-row `selectedBg` highlight is observable in assertions.
 */
export function identityTheme(): Theme {
	return new TestTheme("identity");
}

export function taggingTheme(): Theme {
	return new TestTheme("tagging");
}

class TestTheme extends Theme {
	private readonly renderMode: "identity" | "tagging";

	constructor(renderMode: "identity" | "tagging") {
		super(testFgColors(), testBgColors(), "truecolor");
		this.renderMode = renderMode;
	}

	override fg(color: ThemeColor, text: string): string {
		return this.renderMode === "tagging" ? `[${color}]${text}[/]` : text;
	}

	override bg(color: TestThemeBg, text: string): string {
		return this.renderMode === "tagging" ? `[bg:${color}]${text}[/bg]` : text;
	}

	override bold(text: string): string {
		return this.renderMode === "tagging" ? `<b>${text}</b>` : text;
	}
}

function testFgColors(): Record<ThemeColor, string | number> {
	return {
		accent: "#ffffff",
		border: "#ffffff",
		borderAccent: "#ffffff",
		borderMuted: "#ffffff",
		success: "#ffffff",
		error: "#ffffff",
		warning: "#ffffff",
		muted: "#ffffff",
		dim: "#ffffff",
		text: "#ffffff",
		thinkingText: "#ffffff",
		userMessageText: "#ffffff",
		customMessageText: "#ffffff",
		customMessageLabel: "#ffffff",
		toolTitle: "#ffffff",
		toolOutput: "#ffffff",
		mdHeading: "#ffffff",
		mdLink: "#ffffff",
		mdLinkUrl: "#ffffff",
		mdCode: "#ffffff",
		mdCodeBlock: "#ffffff",
		mdCodeBlockBorder: "#ffffff",
		mdQuote: "#ffffff",
		mdQuoteBorder: "#ffffff",
		mdHr: "#ffffff",
		mdListBullet: "#ffffff",
		toolDiffAdded: "#ffffff",
		toolDiffRemoved: "#ffffff",
		toolDiffContext: "#ffffff",
		syntaxComment: "#ffffff",
		syntaxKeyword: "#ffffff",
		syntaxFunction: "#ffffff",
		syntaxVariable: "#ffffff",
		syntaxString: "#ffffff",
		syntaxNumber: "#ffffff",
		syntaxType: "#ffffff",
		syntaxOperator: "#ffffff",
		syntaxPunctuation: "#ffffff",
		thinkingOff: "#ffffff",
		thinkingMinimal: "#ffffff",
		thinkingLow: "#ffffff",
		thinkingMedium: "#ffffff",
		thinkingHigh: "#ffffff",
		thinkingXhigh: "#ffffff",
		bashMode: "#ffffff",
	};
}

type TestThemeBg = Parameters<Theme["bg"]>[0];

function testBgColors(): Record<TestThemeBg, string | number> {
	return {
		selectedBg: "#000000",
		userMessageBg: "#000000",
		customMessageBg: "#000000",
		toolPendingBg: "#000000",
		toolSuccessBg: "#000000",
		toolErrorBg: "#000000",
	};
}
