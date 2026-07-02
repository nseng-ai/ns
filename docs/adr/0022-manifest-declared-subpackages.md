# Manifest-declared subpackages inside container packages

Published packages may be **container packages**: npm distribution units whose architecture boundaries are declared **subpackages** rather than additional published packages. We use `package.json` `sdl.subpackages` as the source of truth for those architecture units so topology and guard tooling read the same manifest declaration instead of inferring circles from directory conventions.

A package being converted may declare `sdl.remainder: true` as an explicit transitional **remainder subpackage** for source not yet claimed by a named subpackage. We rejected sentinel entries such as `"."` inside `sdl.subpackages` because they hide the transitional state inside the architecture-unit list; a container package is properly formed when all source belongs to named subpackages and no remainder is declared.
