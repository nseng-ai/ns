import { describe, expect, it } from "vitest";

import { buildMarkerBlock, detectShell, planRcInstall, rcPathForShell, resolveShell } from "../../src/shell/rc-block.ts";


describe("rc block helpers", () => {
	it("detects zsh/bash from SHELL and defaults to zsh", () => {
		expect(detectShell({ SHELL: "/bin/zsh" })).toBe("zsh");
		expect(detectShell({ SHELL: "/usr/local/bin/bash" })).toBe("bash");
		expect(detectShell({ SHELL: "/bin/fish" })).toBe("zsh");
		expect(detectShell({})).toBe("zsh");
	});

	it("rejects explicit unsupported shells", () => {
		expect(resolveShell("fish", {})).toEqual({ type: "failure", errorType: "unsupported_shell", message: "Shell 'fish' is not supported. Supported shells: zsh, bash." });
	});

	it("resolves rc paths", () => {
		expect(rcPathForShell("zsh", "/home/me")).toBe("/home/me/.zshrc");
		expect(rcPathForShell("bash", "/home/me")).toBe("/home/me/.bashrc");
	});

	it("builds marker blocks with leading and trailing newlines", () => {
		expect(buildMarkerBlock("BEGIN", "body", "END")).toBe("\nBEGIN\nbody\nEND\n");
	});

	it("plans idempotent installs and normalizes no-trailing-newline rc text", () => {
		expect(planRcInstall("", "BEGIN", "\nBEGIN\nbody\nEND\n")).toEqual({ alreadyInstalled: false, nextText: "\nBEGIN\nbody\nEND\n" });
		expect(planRcInstall("export A=1", "BEGIN", "\nBEGIN\nbody\nEND\n")).toEqual({ alreadyInstalled: false, nextText: "export A=1\n\nBEGIN\nbody\nEND\n" });
		expect(planRcInstall("export A=1\n", "BEGIN", "\nBEGIN\nbody\nEND\n")).toEqual({ alreadyInstalled: false, nextText: "export A=1\n\nBEGIN\nbody\nEND\n" });
		expect(planRcInstall("\nBEGIN\nbody\nEND\n", "BEGIN", "\nBEGIN\nbody\nEND\n")).toEqual({ alreadyInstalled: true, nextText: "\nBEGIN\nbody\nEND\n" });
	});
});
