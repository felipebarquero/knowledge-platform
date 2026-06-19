---
id: linear_mixed_models
title: Linear Mixed Models
chapter: "8.3"
subtitle: Modeling repeated measures and hierarchical data in sport performance.
breadcrumb:
  - Statistics & Measurement
  - Statistical Modelling
  - Mixed Models
tags:
  - Mixed Effects
  - Random Effects
  - Longitudinal Data
  - Hierarchical Modeling
---

# Linear Mixed Models

Repeated measurements introduce dependence between observations: errors within
the same athlete are correlated, violating the independence assumption of
ordinary least squares.

$$
y_{ij} = \beta_0 + \beta_1 x_{ij} + u_j + \varepsilon_{ij}, \qquad u_j \sim \mathcal{N}(0, \tau^2)
$$

The random intercept $ u_j $ absorbs athlete-level baseline differences.

:::note
Fixed effects describe the population; random effects describe the groups.
:::

## Sprint Study

::dataset sprint_study

::control athlete_filter

::control load_cap

::plot sprint_distribution

The pooled histogram hides athlete-level structure. Plotting sprint time
against training load and coloring by athlete makes the grouping visible:

::plot load_vs_time

::component method_note

### Training Load

Average load differs by athlete, and drifts over the season:

::plot weekly_load

::plot load_trend

### Session Log

::table sprint_table

- Repeated sprints per athlete
- Mixed model with an athlete random intercept
- Compare pooled vs partial-pooling fits

## Building Blocks

The reader also ships the HeroUI component library — buttons, chips, alerts,
progress, tabs and more — all customizable in the workshop:

::component ui_showcase

## Querying the Data

The dataset is just a table — and now a real database. This query **joins**
the sessions with the athlete metadata and runs live in DuckDB-WASM, in your
browser, the moment the page loads. Edit it and press Run.

::component sprint_query

For big tables that shouldn't be shipped to the browser, point a query at an
**on-prem SQL server** instead. This one runs through the query gateway against
DuckDB / Postgres / MySQL — only the result rows come back:

::component warehouse_query

## Interactive Dataset Browser

One composable card, four synced children. Hover an Elite/Amateur arc or a
table row to highlight it everywhere; click to filter every child at once.

::component dataset_browser

## The Fitted Model

:::grid{columns=2}
::component model_spec

::component model_results_card
:::

::component model_panel

The same model, fit for real: this R cell runs `lme4::lmer` live in a WASM R
environment (WebR), installing the package and fitting the model in your
browser. The recorded output shows first; live results replace it when R
finishes.

::component model_fit

The session is shared, like a notebook kernel. This next cell reuses the
`model` fitted above **and** the `sprint_query` SQL result as a data frame —
no recomputation, no re-fetching:

::component model_effects

## The modeling pipeline

Every number above flows through one path — raw sessions to fitted effects.
Here it is as a graph: **drag the nodes**, pan and zoom. In the workshop the
layout — and the nodes and edges themselves — is yours to edit.

::component model_workflow

## Reaction-time distributions

Means hide the shape of the data. A **split violin** shows the full reaction-time
distribution for each squad side by side, with a box plot for the quartiles, the
mean (the dot) and any outliers — the raincloud view of a mixed-effects design.
Hover a squad to highlight it across both plots.

::component rt_panel

## Limb asymmetry

Strength is rarely symmetric. This **difference chart** overlays the left- and
right-leg vertical force across a single squat rep: the band is green where the
left leg drives harder and violet where the right does. The asymmetry shifts
through the movement — biomechanically telling, and every colour, curve and
line style is editable in the workshop.

::component squat_asymmetry

## Neuromuscular response

Bar velocity tells the story of the lift. Here the mean velocity profile across
the squat cycle is drawn for three loads, each a luminescent line with its 95%
confidence band — heavier loads move slower through the propulsive phase. Click
a load in the legend to isolate it; hover for a crosshair read-out across every
series.

::component velocity_bands

## Bounce vs no-bounce

The same neuromuscular question, faceted four ways. Each panel is one load or
descent condition; the **solid** line is the bounce technique and the **dashed**
line is no-bounce, both drawn as luminescent mean-velocity profiles. The inset
box plot in every panel carries the bounce − no-bounce **difference** for the
first peak (Vpeak1), second peak (Vpeak2) and mean velocity (Vmean) — a star
marks p < 0.05. Toggle **Interact**, drag to **Pan**, brush to **Zoom**, switch
the **View** between one and two columns, or **Export** the underlying data; the
crosshair syncs across all four panels at once.

::component neuromuscular_panels

## Pareto frontiers

Three Pareto frontiers of recoverable volume against the horizontal wash moving
average. Each glowing line is a frontier mean; the **shaded area around it is the
95% confidence interval**, drawn as a luminous gradient band. Toggle any frontier
— or the **95% CI** area itself — in the legend, and hover for a crosshair
read-out of all three frontiers plus the 95% CI (±) at that wash.

::component pareto_frontiers

