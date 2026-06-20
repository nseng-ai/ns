# Primitive-by-Primitive Strangler Slices

## Summary

Terminology was sharpened: this Objective should not describe itself as the whole `pr-address` steel thread. In a strangler rewrite, the useful pattern is a thin end-to-end slice per replacement primitive.

The current Objective is therefore the first read-only strangler slice for `feedback`, `details`, and `status`, not proof that the full workflow has been strangled.

## Objective Impact

The roadmap now preserves the implementation pattern that each future primitive (`plan`, `batch`, `reply`) should get its own end-to-end strangler slice with parity evidence, rather than being grouped into a single large cutover.

This keeps the old workflow operational while replacing the agent-facing protocol primitive by primitive through the RunEngine boundary.

## Follow-Ups

- Treat `plan`, `batch`, and `reply` as separate follow-up slices unless implementation evidence shows a smaller safe grouping.
- Do not claim full mutation safety or legacy deletion from the read-only slice alone.
