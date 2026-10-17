# AMap layer selection guide

This file gives design-to-implementation guidance. For exact API signatures, always load `../amap-jsapi-skill/SKILL.md` and its references.

| Need | Preferred AMap direction |
| --- | --- |
| small number of interactive points | Marker / LabelMarker |
| many labeled points | LabelsLayer + LabelMarker or other documented high-volume point mechanisms |
| clusters | MarkerCluster when clustering matches the business meaning |
| large point sets without rich DOM | MassMarks / documented high-performance point layer |
| routes / tracks / corridors | Polyline / BezierCurve; separate selected route from background network |
| areas / service zones | Polygon / DistrictLayer |
| heat / density | documented HeatMap capability |
| WMS / WMTS services | standard WMS / WMTS layers |
| custom canvas visualization | CanvasLayer / CustomLayer as documented |
| custom WebGL / very large bespoke rendering | GLCustomLayer or approved Loca implementation after verifying the installed version |
| moving asset on a path | documented marker move animation / moveAlong mechanisms |

## Loca rule

Loca is appropriate when the project needs high-performance WebGL visualization or advanced animated geographic layers. Do not invent Loca class names or method signatures from memory. Verify the installed AMap/Loca version and project dependencies before implementation.

## GSAP rule

Use GSAP for surrounding UI, panel transitions, counters, storytelling sequences, and coordinated page motion. Do not drive hundreds of geographic objects with DOM/GSAP timelines when AMap/WebGL can render them more efficiently.
