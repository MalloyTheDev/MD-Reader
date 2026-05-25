// Curated, static Markdown scaffolds for "New from template". Pure data + builders - no I/O, no
// code execution. Each template returns a complete document body (front-matter + content) that the
// renderer writes into the vault via the normal newFile/writeFile flow.

export type TemplateCategory =
  | 'Software'
  | 'Science & research'
  | 'Education'
  | 'Business & writing'

export interface TemplateContext {
  /** ISO date (YYYY-MM-DD) used for dated templates. */
  date: string
}

export interface DocTemplate {
  id: string
  label: string
  icon: string
  category: TemplateCategory
  description: string
  /** Suggested file name (no extension); may embed the date. Sanitized again in main. */
  fileName: (ctx: TemplateContext) => string
  /** Full Markdown body. */
  build: (ctx: TemplateContext) => string
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  'Software',
  'Science & research',
  'Education',
  'Business & writing'
]

export const TEMPLATES: DocTemplate[] = [
  {
    id: 'readme',
    label: 'Project README',
    icon: '📦',
    category: 'Software',
    description: 'Overview, install, usage, and contributing for a code project.',
    fileName: () => 'README',
    build: () => `---
title: Project Name
tags: [readme, docs]
---

# Project Name

> One-sentence description of what this project does and who it is for.

## Features

- Key feature one
- Key feature two
- Key feature three

## Install

\`\`\`bash
npm install project-name
\`\`\`

## Usage

\`\`\`ts
import { thing } from 'project-name'

thing()
\`\`\`

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| \`debug\` | boolean | \`false\` | Enable verbose logging |

## Contributing

1. Fork and clone the repo
2. \`npm install\`
3. Open a pull request

## License

MIT
`
  },
  {
    id: 'api-reference',
    label: 'API reference',
    icon: '🔌',
    category: 'Software',
    description: 'Endpoint reference with params, responses, and examples.',
    fileName: () => 'API Reference',
    build: () => `---
title: API Reference
tags: [api, docs, reference]
---

# API Reference

Base URL: \`https://api.example.com/v1\`

> [!note] Authentication
> All requests require a \`Authorization: Bearer <token>\` header.

## \`GET /resources\`

List resources.

**Query parameters**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| \`limit\` | integer | no | Max items to return (default 20) |
| \`cursor\` | string | no | Pagination cursor |

**Response \`200\`**

\`\`\`json
{
  "data": [{ "id": "abc", "name": "Example" }],
  "next_cursor": null
}
\`\`\`

## \`POST /resources\`

Create a resource.

\`\`\`json
{
  "name": "New resource"
}
\`\`\`

> [!warning] Rate limits
> 100 requests/minute per token. A \`429\` includes a \`Retry-After\` header.
`
  },
  {
    id: 'design-doc',
    label: 'Design doc (RFC)',
    icon: '📐',
    category: 'Software',
    description: 'Technical proposal: context, options, decision, and rollout.',
    fileName: (c) => `Design - ${c.date}`,
    build: (c) => `---
title: Design Doc - <Title>
tags: [design, rfc]
date: ${c.date}
status: draft
---

# Design: <Title>

| | |
| --- | --- |
| **Author** | You |
| **Status** | Draft |
| **Date** | ${c.date} |

## Context & problem

What are we solving, and why now?

## Goals / non-goals

- **Goals:** ...
- **Non-goals:** ...

## Proposed design

Describe the approach. Diagram the flow:

\`\`\`mermaid
flowchart LR
  A[Client] --> B{API}
  B -->|ok| C[(Database)]
  B -->|error| D[Retry queue]
\`\`\`

## Alternatives considered

1. **Option A** - pros / cons
2. **Option B** - pros / cons

## Decision

> [!important] Decision
> State the chosen option and the key reason.

## Rollout & risks

- [ ] Migration plan
- [ ] Feature flag
- [ ] Monitoring / rollback
`
  },
  {
    id: 'runbook',
    label: 'Runbook / playbook',
    icon: '🚨',
    category: 'Software',
    description: 'Operational steps for an incident or routine procedure.',
    fileName: () => 'Runbook',
    build: () => `---
title: Runbook - <Service>
tags: [runbook, ops]
---

# Runbook: <Service / Scenario>

> [!danger] When to use this
> Symptoms that mean you are in the right place.

## Quick checks

- [ ] Is the service up? (dashboard link)
- [ ] Recent deploy in the last hour?
- [ ] Error rate / latency spike?

## Diagnosis

| Symptom | Likely cause | Action |
| --- | --- | --- |
| 5xx spike | Bad deploy | Roll back |
| Slow queries | Lock contention | Check DB |

## Mitigation steps

1. First do this.
2. Then this.
3. Verify recovery.

## Escalation

> [!note] Contacts
> Primary on-call → secondary → engineering manager.

## Post-incident

- [ ] Write up timeline
- [ ] File follow-up tasks
`
  },
  {
    id: 'research-note',
    label: 'Research note',
    icon: '🔬',
    category: 'Science & research',
    description: 'Capture a paper or idea: summary, method, findings, questions.',
    fileName: () => 'Research note',
    build: () => `---
title: <Paper / Topic>
tags: [research, literature]
authors: []
---

# <Paper / Topic>

> [!abstract] Summary
> One-paragraph summary in your own words.

## Key question

What problem does this work address?

## Method

How was it done? Data, model, or experimental setup.

## Findings

- Finding one
- Finding two

## Relevant equation

$$
\\hat{\\beta} = (X^\\top X)^{-1} X^\\top y
$$

## My notes & critique

> [!question] Open questions
> What is unclear or worth following up?

## References

- Author, *Title*, Year. [[related-note]]
`
  },
  {
    id: 'lab-experiment',
    label: 'Experiment log',
    icon: '🧪',
    category: 'Science & research',
    description: 'Dated lab entry: hypothesis, procedure, observations, result.',
    fileName: (c) => `Experiment ${c.date}`,
    build: (c) => `---
title: Experiment - ${c.date}
tags: [experiment, lab]
date: ${c.date}
---

# Experiment - ${c.date}

> [!hypothesis] Hypothesis
> State the expected outcome and why.

## Materials

| Item | Amount / spec |
| --- | --- |
|  |  |

## Procedure

1. Step one
2. Step two
3. Step three

## Observations

\`\`\`chart
type: line
title: Measurement over time
x: [0, 1, 2, 3, 4]
y: [0, 0, 0, 0, 0]
\`\`\`

## Results

> [!result] Result
> What actually happened vs. the hypothesis.

## Next steps

- [ ] Repeat with controls
- [ ] Adjust variable X
`
  },
  {
    id: 'physics-problem',
    label: 'Physics problem set',
    icon: '⚛️',
    category: 'Science & research',
    description: 'Worked-problem layout with given/find and LaTeX math.',
    fileName: () => 'Problem set',
    build: () => `---
title: Problem Set - <Topic>
tags: [physics, problem-set, math]
---

# Problem Set - <Topic>

## Problem 1

**Given.** Describe the setup.

**Find.** What is asked.

**Solution.**

Starting from Newton's second law,

$$
\\vec{F} = m\\vec{a}
$$

so the acceleration is

$$
\\vec{a} = \\frac{\\vec{F}}{m}.
$$

> [!note] Check units
> $[\\,\\mathrm{m/s^2}\\,] = \\dfrac{[\\mathrm{N}]}{[\\mathrm{kg}]}$.

## Problem 2

The time-dependent Schrödinger equation:

$$
i\\hbar \\frac{\\partial}{\\partial t}\\,\\Psi(\\mathbf{r},t) = \\hat{H}\\,\\Psi(\\mathbf{r},t)
$$

**Answer.** ...
`
  },
  {
    id: 'genetics-note',
    label: 'Genetics note',
    icon: '🧬',
    category: 'Science & research',
    description: 'Gene/variant note with sequence, inheritance, and references.',
    fileName: () => 'Genetics note',
    build: () => `---
title: <Gene / Variant>
tags: [genetics, biology]
---

# <Gene / Variant>

| Field | Value |
| --- | --- |
| Gene symbol |  |
| Chromosome |  |
| Inheritance | autosomal dominant / recessive |

## Sequence (excerpt)

\`\`\`text
5'-ATG GCT ... TAA-3'
\`\`\`

## Allele frequencies

\`\`\`chart
type: bar
title: Genotype distribution
x: [AA, Aa, aa]
y: [0.49, 0.42, 0.09]
\`\`\`

## Phenotype & mechanism

Describe the functional effect.

> [!note] Clinical relevance
> Associated conditions and screening notes.

## References

- OMIM / ClinVar entry
`
  },
  {
    id: 'lecture-notes',
    label: 'Lecture notes',
    icon: '🎓',
    category: 'Education',
    description: 'Dated class notes: objectives, notes, summary, questions.',
    fileName: (c) => `Lecture ${c.date}`,
    build: (c) => `---
title: Lecture - ${c.date}
tags: [lecture, notes]
date: ${c.date}
course: <Course>
---

# Lecture - <Topic>

**Course:** <Course>  ·  **Date:** ${c.date}

> [!abstract] Learning objectives
> - Objective one
> - Objective two

## Notes

- Main idea
  - Supporting detail
- Definition: **term** - meaning

## Key formula / concept

$$
E = mc^2
$$

## Summary

Three-sentence recap in your own words.

> [!question] To review
> - [ ] Concept I did not fully understand
> - [ ] Re-read section X
`
  },
  {
    id: 'study-guide',
    label: 'Study guide',
    icon: '📚',
    category: 'Education',
    description: 'Exam-prep guide with topics, Q&A, and a flashcard section.',
    fileName: () => 'Study guide',
    build: () => `---
title: Study Guide - <Subject>
tags: [study, exam]
---

# Study Guide - <Subject>

## Topics to master

- [ ] Topic 1
- [ ] Topic 2
- [ ] Topic 3

## Key terms

| Term | Definition |
| --- | --- |
|  |  |

## Practice questions

1. **Q:** ...
   **A:** ...
2. **Q:** ...
   **A:** ...

## Flashcards

> [!note] Q: What is ...?
> A: ...

> [!note] Q: How does ... work?
> A: ...
`
  },
  {
    id: 'meeting-notes',
    label: 'Meeting notes',
    icon: '🗓️',
    category: 'Business & writing',
    description: 'Dated agenda, discussion, decisions, and action items.',
    fileName: (c) => `Meeting ${c.date}`,
    build: (c) => `---
title: Meeting - ${c.date}
tags: [meeting, notes]
date: ${c.date}
attendees: []
---

# Meeting - ${c.date}

**Attendees:** ...

## Agenda

1. Item one
2. Item two

## Discussion

- Point raised → response

## Decisions

> [!important] Decided
> - Decision one
> - Decision two

## Action items

- [ ] Owner - task - due date
- [ ] Owner - task - due date
`
  },
  {
    id: 'project-plan',
    label: 'Project plan / PRD',
    icon: '📋',
    category: 'Business & writing',
    description: 'Product requirements: problem, scope, milestones, metrics.',
    fileName: () => 'Project plan',
    build: (c) => `---
title: Project Plan - <Name>
tags: [project, plan, prd]
date: ${c.date}
status: draft
---

# Project Plan: <Name>

## Problem & opportunity

Who has the problem, and what is the cost of not solving it?

## Goals & success metrics

| Goal | Metric | Target |
| --- | --- | --- |
|  |  |  |

## Scope

- **In scope:** ...
- **Out of scope:** ...

## Milestones

\`\`\`mermaid
gantt
  title Roadmap
  dateFormat YYYY-MM-DD
  section Phase 1
  Discovery      :a1, ${c.date}, 7d
  Build          :a2, after a1, 14d
  section Phase 2
  Launch         :a3, after a2, 7d
\`\`\`

## Risks

> [!warning] Top risks
> - Risk → mitigation

## Open questions

- [ ] Question one
`
  },
  {
    id: 'blog-post',
    label: 'Article / blog draft',
    icon: '✍️',
    category: 'Business & writing',
    description: 'Long-form writing scaffold with intro, body, and takeaways.',
    fileName: () => 'Draft',
    build: (c) => `---
title: <Working Title>
tags: [draft, writing]
date: ${c.date}
---

# <Working Title>

> Hook: one or two sentences that make the reader care.

## Introduction

Set up the problem or question.

## Section one

Make a point. Support it with an example.

## Section two

Develop the idea further.

## Key takeaways

- Takeaway one
- Takeaway two

## Conclusion

Tie back to the hook and leave the reader with one idea.
`
  },
  {
    id: 'daily-journal',
    label: 'Daily journal',
    icon: '📓',
    category: 'Business & writing',
    description: 'Dated journal: focus, log, wins, and reflections.',
    fileName: (c) => `Journal ${c.date}`,
    build: (c) => `---
title: Journal - ${c.date}
tags: [journal, daily]
date: ${c.date}
---

# ${c.date}

## Today's focus

- [ ] Most important thing
- [ ] Second
- [ ] Third

## Log

-

## Wins

-

## Reflections

What went well, what to change tomorrow.
`
  },
  {
    id: 'blank',
    label: 'Blank note',
    icon: '📄',
    category: 'Business & writing',
    description: 'An empty note with just a title and front-matter.',
    fileName: () => 'Untitled',
    build: () => `---
title: Untitled
tags: []
---

# Untitled

`
  }
]

export function getTemplate(id: string): DocTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

export function templatesByCategory(cat: TemplateCategory): DocTemplate[] {
  return TEMPLATES.filter((t) => t.category === cat)
}
