# Greenmech Module Model, GMM v1

One module model is one self-contained SVG file.

- Under 40 KB. Name it `<slug>.svg`, for example `lift-arm.svg`.
- Root `viewBox="0 0 400 300"`, 20 units of margin.
- Technical orthographic front elevation, thin uniform linework.
- `stroke="currentColor"` and `fill="none"`. Hatching may use `currentColor` at `fill-opacity=".12"`.
- No gradients, shadows, scripts, external links (`href`, `xlink:href`), `<use>`, `<image>`, `<foreignObject>`, event attributes, or `url(...)` in styles.

Required structure, with these ids:

| id | element | content |
|---|---|---|
| `envelope` | `<g>` | dashed bounds rectangle 20,20 to 380,280 |
| `parts` | `<g>` | one `<g>` per major part, with a descriptive id |
| `ports` | `<g>` | one `<circle r="6">` per connection point, ids `in-1`, `out-1`, with `data-kind="in|out"` and `data-carries="ball|spin|push|water|other"` |
| `labels` | `<g>` | short numbered callouts |
| `gmm` | `<metadata>` | JSON: `{"standard":"GMM v1","slug":"","purpose":"","sizeMm":{"w":0,"h":0,"d":0},"ports":[{"id":"out-1","kind":"out","side":"right","at":0.5,"carries":"ball"}]}` |

Real dimensions come from the team's own measurements. Never invent them.

The app checks uploads in `src/lib/svg-gmm.ts` and rejects any file that breaks a rule, with a message naming the rule. It never fixes a file silently. On a module page, "Copy AI drawing prompt" copies the drafting prompt (BUILD_PROMPT.md Appendix C) with the module's slug, purpose and ports filled in.
