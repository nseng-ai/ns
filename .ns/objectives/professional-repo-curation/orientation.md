**Direction: transfer this repository in place after professional presentation, checkout-free product paths, and the approved release-disposition package ontology are complete. ADR 0045 supersedes the flat `ts/packages/incubator/` zone: every workspace package lands under `public/`, `incubating/`, or `internal/` with owner-nested paths, leaf/package-identity matching, scope by disposition, and disposition dependency closure.**

Getting to: finish the rename prose sweep; run the foundation README-driven pass; execute the `package-disposition-and-host-ontology` atomic cutover (stack design, coordinated landing, guards); reconcile the shipped checkout-free Objectives path; verify PR Feedback; ship root README + `why-ns.md`; harden and transfer.

What you see now: the flat `ts/packages/incubator/` layout is still on disk as superseded transitional state — ADR 0045 and its approved destination map are the settled destination, but no package moves are authorized outside the Subobjective's coordinated landing. Root `README.md` is still a placeholder, `why-ns.md` is absent, and PR Feedback remains checkout-bound in its README.

Avoid: treating the flat incubator or the old two-zone invariant as destination guidance; new dependency edges that violate disposition closure (public→incubating/internal); old ns-domain “capability” naming; polishing incubating residents outside an explicit slice; claiming checkout-free behavior without package/registry evidence; committing secrets, tokens, private data, or other history that cannot transfer.

Active slices: close `rename-capability-to-extension`, start the Clinkr child under `foundation-readme-driven-pass`, and advance `package-disposition-and-host-ontology` implementation-stack design.
