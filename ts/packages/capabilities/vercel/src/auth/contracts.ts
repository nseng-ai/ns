import { z } from "zod";

export const vercelProjectIdSchema = z
	.string()
	.regex(/^prj_[A-Za-z0-9]+$/, "must be a Vercel project ID beginning with 'prj_'");

export const vercelTeamIdSchema = z
	.string()
	.regex(/^team_[A-Za-z0-9]+$/, "must be a Vercel team ID beginning with 'team_'");
