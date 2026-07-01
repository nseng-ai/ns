export const doctorSkillFindingSeverities = ["error", "warning", "info"] as const;

export type DoctorSkillFindingSeverity = (typeof doctorSkillFindingSeverities)[number];

export const DOCTOR_SKILL_SEVERITY_RANK: Record<DoctorSkillFindingSeverity, number> = {
	error: 0,
	warning: 1,
	info: 2,
};
