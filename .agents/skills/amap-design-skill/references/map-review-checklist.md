# Map review checklist

## Visual

- Is the business layer more prominent than the basemap?
- Can the user identify the main corridor or selected task in under a few seconds?
- Are node sizes and line widths hierarchical?
- Are labels readable without forming a dense block?
- Are warning/error colors reserved for actual state?

## Interaction

- Does click create a persistent selected state?
- Can the user reset the map view?
- Does filtering reduce clutter rather than only recolor it?
- Are popups/panels positioned without covering the selected object?
- Do zoom and fit operations preserve orientation?

## IA / page structure

- Are independent submodules in second-level navigation and routes?
- Are Tabs used only for closely related views of the same page/task/entity?
- Can users deep-link to major business destinations?

## Performance

- Does pan/zoom remain smooth with realistic data volume?
- Are listeners and map instances cleaned up?
- Are high-volume points rendered with a suitable layer instead of DOM markers?
- Is animation limited to meaningful foreground content?
