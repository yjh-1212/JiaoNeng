# Map performance rules

## Rendering strategy

- Prefer map-native / WebGL-capable layers over large numbers of DOM elements.
- Use progressive disclosure: do not load/render detail that is invisible at the current zoom.
- Separate static network geometry from frequently changing task state.
- Update only changed features instead of recreating the whole map on every tick.
- Avoid full map reinitialization when filters change.
- Destroy map instances and listeners on component unmount.
- Load AMap plugins on demand.

## Data strategy

- Simplify geometry for macro zoom when detailed vertices add no visible value.
- Cluster or aggregate only when it preserves business meaning.
- Cache stable reference data (regions, hubs, network) separately from live data.
- Throttle high-frequency position updates to a visually useful cadence.

## Animation strategy

- Animate selected/important flows, not every background route.
- Prefer transform/WebGL/map-native motion to layout-heavy DOM animation.
- Keep simultaneous pulsing/glowing objects limited.
- Respect reduced-motion preferences for non-essential motion.

## Review

Use browser performance tools or Playwright/browser review to inspect:

- first usable map render
- pan/zoom smoothness
- filter switching
- memory after navigating away/back
- large dataset behavior
- repeated popup/selection interactions
