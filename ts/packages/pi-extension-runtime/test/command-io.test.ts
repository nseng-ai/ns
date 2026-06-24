import { describe, expect, test } from "vitest";

import { commandIoFromPiContext } from "../src/command-io.ts";

describe("commandIoFromPiContext", () => {
	test("sets and clears status key", () => {
		const statuses: Array<{ key: string; value: string | undefined }> = [];
		const io = commandIoFromPiContext(
			{
				ui: {
					setStatus: (key, value) => statuses.push({ key, value }),
					notify: () => {},
				},
			},
			{ statusKey: "autoslot" },
		);

		io.phase("Working");
		io.clearPhase();

		expect(statuses).toEqual([
			{ key: "autoslot", value: "Working" },
			{ key: "autoslot", value: undefined },
		]);
	});

	test("forwards ui notifications", () => {
		const notifications: Array<{ message: string; level: string | undefined }> = [];
		const io = commandIoFromPiContext(
			{
				ui: {
					notify: (message, level) => notifications.push({ message, level }),
				},
			},
			{ statusKey: "autoslot" },
		);

		io.notify("Done");
		io.notify("Careful", "warning");

		expect(notifications).toEqual([
			{ message: "Done", level: "info" },
			{ message: "Careful", level: "warning" },
		]);
	});
});
