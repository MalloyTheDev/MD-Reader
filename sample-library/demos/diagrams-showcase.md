---
title: Diagrams Showcase
tags: [demo, mermaid]
---

# Diagrams Showcase

Hover any diagram for its toolbar: **zoom**, **reset (⟲)**, **fullscreen (⛶)**, **Copy** source, and export **SVG**/**PNG**. Drag to pan; double-click to reset.

## Flowchart

```mermaid
graph TD
  A[Start] --> B[Read Markdown]
  B --> C{Has diagram?}
  C -->|Yes| D[Render Diagram]
  C -->|No| E[Render Text]
  D --> F[Done]
  E --> F
```

## Sequence diagram

```mermaid
sequenceDiagram
  participant U as User
  participant A as App
  participant FS as Disk
  U->>A: Open note
  A->>FS: Read file
  FS-->>A: Markdown
  A-->>U: Rendered page
```

## Class diagram

```mermaid
classDiagram
  class Library {
    +files: Note[]
    +open(path)
    +remove(path)
  }
  class Note {
    +title: string
    +tags: string[]
  }
  Library "1" --> "*" Note
```

## State diagram

```mermaid
stateDiagram-v2
  [*] --> Reading
  Reading --> Editing: Edit
  Editing --> Reading: Save
  Reading --> [*]
```

## Entity relationship

```mermaid
erDiagram
  LIBRARY ||--o{ NOTE : contains
  NOTE ||--o{ TAG : has
  NOTE ||--o{ ANNOTATION : holds
```

## Gantt

```mermaid
gantt
  title Project Plan
  dateFormat YYYY-MM-DD
  section Build
  Vault       :done,    a1, 2026-05-01, 5d
  Math        :active,  a2, 2026-05-06, 4d
  Mermaid     :         a3, 2026-05-10, 3d
```

## Pie

```mermaid
pie title Note types
  "Research" : 40
  "Study" : 30
  "Code" : 20
  "Other" : 10
```

## Mindmap

```mermaid
mindmap
  root((MD Reader))
    Reading
      Pagination
      Themes
    Authoring
      Editor
      Templates
    Science
      Math
      Diagrams
```

## Error handling (intentional typo)

A broken diagram shows an error panel with the source — it never crashes the page:

```mermaid
graph TD
  A -->
  B[[[oops
```
