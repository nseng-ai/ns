import { z } from "zod";

import {
	EXPLORE_ABSOLUTE_MAX_TASKS,
	EXPLORE_BREADTH_PROFILES,
	EXPLORE_BREADTH_VALUES,
	type ExploreBreadth,
} from "./contract.ts";

export const EXPLORE_DEFAULT_BREADTH: ExploreBreadth = "medium";
export const EXPLORE_TITLE_MAX_CHARS = 120;
export const EXPLORE_PROMPT_MAX_CHARS = 4_000;

export const exploreInputSchema = z
	.object({
		breadth: z.enum(EXPLORE_BREADTH_VALUES).default(EXPLORE_DEFAULT_BREADTH),
		tasks: z
			.array(
				z.object({
					title: z.string().trim().min(1).max(EXPLORE_TITLE_MAX_CHARS),
					prompt: z.string().trim().min(1).max(EXPLORE_PROMPT_MAX_CHARS),
				}),
			)
			.min(2)
			.max(EXPLORE_ABSOLUTE_MAX_TASKS),
	})
	.strict()
	.superRefine((input, ctx) => {
		const profile = EXPLORE_BREADTH_PROFILES[input.breadth];
		if (input.tasks.length > profile.maxTasks) {
			ctx.addIssue({
				code: "custom",
				path: ["tasks"],
				message: `Too many explore tasks for breadth "${input.breadth}": got ${input.tasks.length}, max ${profile.maxTasks}. Choose a larger breadth or fewer tasks.`,
			});
		}
	});

export type ExploreInput = z.infer<typeof exploreInputSchema>;
export type ExploreTaskInput = ExploreInput["tasks"][number];
