# Core branch-slug relocation retired the final manifest-cycle deferral

The branch-slug primitives moved from the `@sdl/pi` Presentation Host to neutral infra at `@sdl/core/branch-slug`. `@sdl/autobranch` and CCC consumers now use the core subpath instead of importing through the Pi host.

This removes the `@sdl/autobranch` → `@sdl/pi` manifest edge. The TypeScript style guard no longer carries the legacy autobranch/pi/sdl deferred Extension Dependency Graph component; future manifest-scoped cycles among graph packages fail normally.

The parent architecture Objective remains open. Remaining work is capability distance and clean-consumer conversion, especially retiring transitional-package consumers and completing per-capability migrations; this update only closes the final explicit manifest-cycle deferral.
