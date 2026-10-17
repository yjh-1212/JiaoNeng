---
name: enterprise-saas-product-builder
description: Orchestrates end-to-end product design, UI design, frontend implementation, browser review, and Playwright verification for enterprise SaaS, admin systems, data platforms, internal tools, and complex business applications. Use when work should be routed through specialized installed skills without merging or reimplementing their expertise.
license: MIT
compatibility: Requires the routed specialist skills to be installed and discoverable by the agent. Browser review requires an available interactive browser or equivalent preview tool; functional verification uses playwright-skill when installed.
metadata:
  author: local-orchestrator
  version: "1.2.0"
---

# Enterprise SaaS Product Builder

## Purpose

This is an **orchestration skill**, not a replacement for specialist skills.

Its job is to:

1. classify the user's task,
2. select the minimum necessary workflow,
3. activate the correct specialist skill for each phase,
4. preserve outputs and decisions between phases,
5. enforce phase quality gates,
6. run browser review and functional verification before declaring production-facing work complete.

## Non-negotiable rule: orchestrate, do not fuse

Never copy, paraphrase, compress, or reimplement a specialist skill's professional method inside this skill.

Before executing a routed phase:

1. discover the named specialist skill in the local skill registry,
2. load its complete `SKILL.md` and any resources it requires,
3. execute that skill according to its own instructions,
4. pass the relevant prior artifacts and decisions into it,
5. retain its output as the source of truth for the next phase.

Do **not** execute a phase from memory, from this routing table, or from a short summary of the specialist skill.

If a required specialist skill is not installed or cannot be loaded, stop only that phase and report the exact missing skill. Do not silently substitute a reduced implementation.

## Specialist routing registry

| Capability | Required specialist skill |
|---|---|
| Product meaning, business semantics, feature scope | `product-design` |
| End-to-end user workflow and release slicing | `user-story-mapping` |
| Navigation, hierarchy, taxonomy, information organization | `information-architecture` |
| Task flows, interaction states, recovery models, UX handoff | `product-design-and-ux` |
| Enterprise dashboard/admin page patterns and required features | `dashboard-product-design-standard` |
| Dashboard visual foundations required by the above skill | `dashboard-design-system` |
| Product interface hierarchy, layout craft, design consistency | `interface-design` |
| UI/UX design intelligence, palettes, typography, charts, stack guidance | `ui-ux-pro-max` |
| Distinctive production frontend visual implementation | `frontend-design` |
| Map/GIS visual hierarchy, layer strategy, logistics/geospatial interaction | `amap-design-skill` |
| AMap JSAPI v2.0 implementation and AMap LBS plugins | `amap-jsapi-skill` |
| Google Maps → AMap migration (current bundled agent capability) | `amap-map-agent-skills` |
| Motion and interaction animation | matching installed `gsap-*` specialist skill(s) |
| Functional browser automation and regression | `playwright-skill` |

For GSAP, discover the installed official GSAP skills and select the skill(s) whose descriptions match the requested animation. Do not force all GSAP skills into every task.

For map/geospatial surfaces, route by responsibility:

- visual hierarchy, layer selection, zoom-level disclosure, logistics/network map design → `amap-design-skill`
- concrete AMap JSAPI v2.0 implementation, overlays, services, events, map lifecycle → `amap-jsapi-skill`
- Google Maps → AMap migration only → `amap-map-agent-skills` (the currently bundled upstream agent package contains only the migration skill)

Do not assume `amap-map-agent-skills` provides general-purpose POI/routing agent tools unless those additional upstream skills are actually installed.

## Task classification

Choose one primary mode before routing.

### Mode A — New product or system

Examples: a new enterprise SaaS, logistics platform, supply-chain system, data platform, admin application, or major greenfield module.

Default route:

`product-design` → `user-story-mapping` → `information-architecture` → `product-design-and-ux` → `dashboard-product-design-standard` (+ `dashboard-design-system` when required) → `interface-design` → `ui-ux-pro-max` → `frontend-design` → relevant `gsap-*` → browser review → `playwright-skill`

Skip a phase only when its output is demonstrably already available and still valid.

When a routed product surface contains a business map, insert `amap-design-skill` before frontend implementation and `amap-jsapi-skill` for the concrete map implementation. If the task is a Google Maps migration, also route through `amap-map-agent-skills`.

### Mode B — New feature/module in an existing product

Start by preserving the existing product model, navigation, design system, and technical conventions.

Typical route:

`product-design` → `user-story-mapping` when the feature has a multi-step workflow → `information-architecture` when navigation or object organization changes → `product-design-and-ux` → `dashboard-product-design-standard` as applicable → `interface-design` → `ui-ux-pro-max` only when visual-system decisions are needed → `frontend-design` → relevant `gsap-*` if needed → browser review → `playwright-skill`

Do not redesign unrelated areas.

### Mode C — UI redesign / visual refinement only

If product behavior and information architecture are already correct:

`interface-design` → `ui-ux-pro-max` → `frontend-design` → relevant `gsap-*` if needed → browser review → targeted `playwright-skill`

If the screen's problem is actually structural or product-related, route backward to the earliest necessary specialist skill instead of polishing a bad structure.

### Mode D — Functional change / bug / production hardening

Preserve existing approved product and visual decisions unless the change requires them to move.

Typical route:

implementation work using project conventions → browser review when UI is affected → `playwright-skill`

Invoke product/UX skills only if behavior, state, navigation, or workflow must change.

## Phase execution protocol

For every routed phase:

1. **Load the specialist** — read the complete installed skill and its referenced resources.
2. **Prepare context** — provide the original user request plus relevant prior artifacts, constraints, project code/context, and accepted decisions.
3. **Execute the specialist exactly** — let that skill determine its detailed method.
4. **Capture a handoff packet** — record only the results needed downstream, not a rewritten version of the specialist skill.
5. **Check the gate** — verify the required outcome exists before moving forward.

Use the handoff format in `references/HANDOFF.md` when a persistent project artifact is useful.

## Context preservation

Prefer passing concrete artifacts by file/path/reference rather than lossy summaries.

When possible, retain:

- original user requirements,
- approved business terminology,
- product objects and relationships,
- workflow/story map,
- navigation/information architecture,
- state and recovery behavior,
- page inventory,
- design-system decisions,
- code conventions,
- test scenarios,
- unresolved risks.

Never replace a rich upstream artifact with a shorter paraphrase if the downstream skill can read the original artifact directly.

## Quality gates

### Product gate

Before designing a new product surface, the product meaning and user task must be sufficiently grounded. If not, route to `product-design`.

### Workflow gate

For multi-step operational flows, the end-to-end activity/task sequence must be understood before finalizing navigation or detailed screens. If not, route to `user-story-mapping`.

### Information architecture gate

Before implementing a multi-page feature, confirm where the feature belongs, how users reach it, and how major objects/actions are organized. If not, route to `information-architecture`.

### Navigation-depth gate

For enterprise/admin systems, do not flatten independent second-level business modules into one page of Tabs. A submodule should normally become visible secondary navigation + its own route when it has its own page goal, list/table, filters, CRUD/actions, workflow, permissions, or deep-link value. Tabs are for closely related views of the **same page/task/entity context**, not a substitute for system navigation.

Before frontend implementation, verify that the page inventory and route inventory agree. If several items users would describe as separate functions are implemented only as Tabs on one route, route back to `information-architecture`.

### Interaction/state gate

Transactional or operational features must define meaningful states, available actions, validation, failure/recovery, and completion feedback before production implementation. Route to `product-design-and-ux` when these are missing.

### SaaS page-completeness gate

For admin/data-management screens, route through `dashboard-product-design-standard` so required operational features are evaluated. Load `dashboard-design-system` when that skill requires it.

### Visual-system gate

Do not let multiple production screens drift independently. Use `interface-design` and, when appropriate, `ui-ux-pro-max` before large-scale visual implementation.

### Map/GIS gate

When a screen's primary value depends on geographic data, routes, corridors, nodes, regions, tracking, or spatial analysis, route through `amap-design-skill` before implementation. When AMap is the map engine, load `amap-jsapi-skill` for the implementation. Review map readability at realistic zoom levels and data density, not only in source code.

### Rendered-browser gate

Do not declare UI work complete from source-code inspection alone.

Use an available interactive/internal browser to open the real application and inspect the actual rendered result. Exercise relevant navigation, scrolling, forms, dropdowns, dialogs/drawers, tables, charts, maps, hover/focus states, and responsive layouts. Fix issues and re-check.

If no interactive browser is available, use `playwright-skill` for rendered screenshots and interaction checks when possible.

### Production functional gate

For a system intended for real use, run `playwright-skill` on the critical flows affected by the change. The specialist skill determines implementation details; the test scope should reflect real product risk, including happy paths and relevant loading, empty, validation, permission, failure, refresh/persistence, and regression cases.

## Browser review vs Playwright

They are complementary:

- **Interactive/internal browser:** visual hierarchy, density, proportion, responsiveness, chart/map presentation, motion feel, overlays, and interaction quality.
- **Playwright:** deterministic workflow verification, regression coverage, assertions, state transitions, errors, persistence, permissions, and repeatable testing.

For production systems, prefer both when the environment supports them.

## Routing backward when a later phase exposes an earlier problem

A phase may reveal that an upstream decision is wrong. Route back to the earliest responsible specialist.

Examples:

- confusing page grouping → `information-architecture`, not CSS tweaks;
- independent business modules flattened into Tabs → `information-architecture` and route/page restructuring;
- map clutter, weak corridor hierarchy, or poor zoom-level disclosure → `amap-design-skill`;
- unclear permitted action in an exception state → `product-design-and-ux`;
- feature has no clear user value → `product-design`;
- visually inconsistent controls → `interface-design` / `ui-ux-pro-max`;
- animation performance issue → matching `gsap-*` specialist;
- workflow breaks after refresh → `playwright-skill` plus implementation fix.

After correction, re-run only the downstream phases invalidated by the change.

## Completion criteria

A task is complete only when the phases required for its selected mode have passed their gates.

For production-facing feature work, completion normally requires:

1. behavior implemented,
2. actual rendered UI reviewed when UI changed,
3. critical affected flows verified with `playwright-skill`,
4. no known blocking errors left unreported,
5. downstream artifacts remain consistent with upstream approved decisions.

Do not claim completion merely because code was generated or a page rendered once.
