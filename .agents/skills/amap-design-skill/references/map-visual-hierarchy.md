# Map visual hierarchy

## Priority model

Use four business priorities before styling:

| Priority | Typical content | Visual treatment |
| --- | --- | --- |
| P1 | current task, selected corridor, active alert | strongest contrast, clear selected state |
| P2 | primary corridors, core hubs, primary regions | strong but below P1 |
| P3 | secondary nodes, supporting routes | medium contrast |
| P4 | context / background network | subdued |

Administrative boundaries and ordinary basemap content sit below P4 unless the user task explicitly depends on them.

## State semantics

Keep state semantics stable across layers:

- default: normal business color
- hover/focus: slight lift in width/size/halo
- selected: persistent emphasis + details panel
- busy/warning: warm warning signal
- exception/error: high-salience alert signal; reserve it for real exceptions
- inactive/unselected: dim rather than recolor to a misleading state

## Zoom-level information density

Treat zoom as progressive disclosure:

- national / macro: only primary regions, corridors, and tier-1 hubs
- regional: reveal tier-2 hubs, branch corridors, selected labels
- city / local: reveal task nodes, facilities, detailed paths
- close operational view: reveal vehicles/assets, exact interactions, fine annotations

Never solve label collision only by making labels smaller.

## Labels

1. Define tier-1 labels that are always eligible.
2. Define tier-2/tier-3 labels by zoom.
3. Prefer collision-aware label mechanisms where available.
4. Keep labels horizontal unless the map convention requires otherwise.
5. Avoid showing numerical KPI text on every node at macro zoom; put detail in selection panels.
