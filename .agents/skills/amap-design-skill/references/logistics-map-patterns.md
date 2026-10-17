# Logistics map patterns

## Network model

Represent the transport network using explicit business classes:

- source / origin region
- destination / demand region
- rail hub
- road hub
- port / terminal
- warehouse / yard
- multimodal hub
- primary corridor
- feeder / drayage route
- active shipment / transport task
- alert / disruption

## Transport-mode differentiation

Do not rely on color alone. Combine color with one or more of:

- line pattern (solid / dashed)
- width
- motion direction
- particle cadence
- node symbol
- halo / outline

A typical design language may use distinct visual families for rail, road, water, and multimodal corridors, but the exact palette should follow the project design system.

## Corridor hierarchy

1. Main trunk corridors: visible at macro zoom.
2. Regional branches: appear after zoom-in or filter selection.
3. Last-mile / feeder routes: local zoom only.
4. Task-specific route: emphasized above the network while selected.

Avoid drawing every physical rail/road segment when the business question is corridor operation.

## Node hierarchy

Tier 1: national / cross-regional hubs and core ports.  
Tier 2: regional hubs and transfer nodes.  
Tier 3: operational facilities and task nodes.

Only Tier 1 should dominate at national scale.

## Tracking interaction

Selecting a shipment should be able to reveal:

- origin → current position/node → next node → destination
- mode changes / handoffs
- planned vs actual path when meaningful
- ETA / delay / exception state
- related task detail in a stable side panel or drawer

Do not represent an active shipment only as a blinking icon with no context.
