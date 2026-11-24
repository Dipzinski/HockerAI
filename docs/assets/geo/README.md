# US state outlines

`us-states.json` holds the lower 48 states and DC as simplified, shared-arc geometry for the Home map.

- **Source:** us-atlas 3.0.1, `states-10m.json` (sha256 `d76b391ccfa8bff601d51e3e3da5d43a89fa46cd5caca72ce731b383be5596d0`),
  a TopoJSON redistribution of the US Census Bureau cartographic boundary files, 2017 edition (public domain).
- **Conversion:** `node scripts/build-us-geo.mjs <states-10m.json>`. It drops Alaska, Hawaii and the territories,
  drops tiny islands, simplifies each shared arc once (Douglas-Peucker, 0.018 degrees) so neighbouring states stay
  seamless, and rounds to 0.01 degrees. Arcs are delta-encoded integers; states list rings of signed arc references.
- **Projection:** applied at runtime with `albers()` from `assets/js/widgets/projection.js`.

us-atlas licence (ISC), Copyright 2013-2019 Michael Bostock:

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby
granted, provided that the above copyright notice and this permission notice appear in all copies. The software is
provided "as is" and the author disclaims all warranties.
