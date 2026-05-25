---
title: Charts Showcase
tags: [demo, charts]
---

# Charts Showcase

Charts are written as a fenced ` ```chart ` block with a simple, safe spec (no code runs). Hover for **Copy** / export **SVG** / **PNG**.

## Line - research data

```chart
type: line
title: Population (billions)
x: [2000, 2005, 2010, 2015, 2020]
y: [2.1, 2.8, 3.4, 4.0, 4.8]
```

## Bar - project metrics (two series)

```chart
type: bar
title: Tasks per sprint
series: [Planned, Done]
x: [S1, S2, S3, S4]
y: [12, 15, 18, 20]
y2: [10, 14, 15, 19]
```

## Pie - note types

```chart
type: pie
labels: [Research, Study, Code, Other]
values: [40, 30, 20, 10]
```

## Scatter - physics data (x vs y)

```chart
type: scatter
title: Velocity vs time
x: [0, 1, 2, 3, 4, 5]
y: [0, 9.8, 19.6, 29.4, 39.2, 49]
```

## Area - finance

```chart
type: area
title: Revenue ($k)
x: [Q1, Q2, Q3, Q4]
y: [120, 150, 170, 210]
```

## JSON form (biology/genetics example)

```chart
{ "type": "bar", "title": "Allele frequency", "x": ["AA","Aa","aa"], "y": [0.49, 0.42, 0.09] }
```

## Errors are safe

A broken spec shows an error panel with the source, never crashing the page:

```chart
type: line
oops no data here
```
