# Adopt Package-Level README-Driven Subobjectives

## Summary

Package curation will run through one Readme-Driven-Development Subobjective per package rather than placing detailed audits and mismatch backlogs in this umbrella. Each Subobjective develops `references/README-draft.md` through a human-steered interrogative process, audits the implementation against the emerging contract, records explicit mismatch dispositions, and probes accidental complexity.

Refactoring proposals may emerge and may be worth sequencing before the draft is fully settled when they support discovery or reconciliation, but implementation of every refactoring requires prior discussion with the user. Public-interface and observable-behavior decisions settle through the draft. The package README is produced by promoting the settled draft only after reconciliation and verification.

## Objective Impact

The first foundation roadmap row is now a Subobjective-creation sequence. A future `objective-next` invocation should create the next package Subobjective, beginning with `clinkr`, instead of directly drafting or changing package code under the umbrella. The umbrella retains dependency ordering, cross-package lessons, and synthesis responsibility.

## Follow-Ups

- Create the Clinkr Readme-Driven-Development Subobjective as the next step.
- Use the Clinkr pass to calibrate the process before creating the Foundation, Brmem, SDK, and Capability Kit Subobjectives.
- Synthesize each closed package Subobjective's contract decisions, complexity findings, and sequencing effects into this umbrella.
