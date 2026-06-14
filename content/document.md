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

