// Templates that come with Mufka. They live in the app, not in the vault: a
// note made from one is an ordinary Markdown file. Copying them into the
// Templates folder makes them editable; a template there with the same name
// takes the place of the built-in one. Filled by lib/template.mjs, so they use
// Obsidian's variables ({{title}}, {{date}}, {{date:FORMAT}}, {{time}}).
//
// Each: { id, name, title (the suggested note name, also filled), text }.

const daily = `---
type: daily
date: {{date:YYYY-MM-DD}}
mood:
tags: [daily]
---
> [!tip] Today's focus
> The one thing that would make today a good day:

## Top 3
- [ ] Most important
- [ ] Second
- [ ] Something small

## Notes


## Wins & gratitude
- One good thing today

## Tomorrow
- [ ] First thing tomorrow
`;

const meeting = `---
type: meeting
date: {{date:YYYY-MM-DD}}
time: {{time}}
attendees: []
tags: [meeting]
---
- **When:** {{date:dddd, D MMMM YYYY}} · {{time}}
- **Where:**
- **Who:**

## Agenda
1. First topic
2. Second topic
3. Anything else

## Notes


> [!note] Decisions
> - What was decided

## Action items
- [ ] **Who** — what — by when
- [ ] Follow up

## Next meeting
- Date and time
`;

const project = `---
type: project
icon: 🚀
cover: violet
status: Planning
start: {{date:YYYY-MM-DD}}
due:
owner:
tags: [project]
---
> [!abstract] Goal
> What does done look like?

## Why it matters
- The difference this makes

## Milestones
- [ ] First milestone
- [ ] Second milestone

## Tasks
- [ ] First task
- [ ] Next task

## People & resources
- **Links:** [[Related note]]

## Log
- **{{date:YYYY-MM-DD}}** — Started.
`;

const projectBoard = `---
type: project-board
icon: 🗂️
cover: blue
tags: [projects]
---
Every project is a note of its own and its checklist is its progress. Drag a card to change its status.

\`\`\`projects
folder: Projects
\`\`\`

## Notes
- 
`;

const book = `---
type: book
author:
status: reading
started: {{date:YYYY-MM-DD}}
finished:
rating:
tags: [book]
---
- **Author:**
- **Status:** Reading
- **Rating:** ☆☆☆☆☆

## In one sentence


## Highlights
>

>

## My thoughts
- What stayed with me

## Ideas to try
- [ ] One idea to try

## Related
- [[Related note]]
`;

const habits = `---
type: habits
icon: ✅
cover: teal
week: {{date:YYYY-[W]ww}}
tags: [habits]
---
Tick the days you keep a habit; the card keeps count.

\`\`\`habits
\`\`\`

## This week
| Habit | Goal | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 💧 Drink 2 litres of water | 7 |  |  |  |  |  |  |  |
| 🏃 Move for 30 minutes | 5 |  |  |  |  |  |  |  |
| 📖 Read 20 pages | 5 |  |  |  |  |  |  |  |
| 😴 In bed by 23:00 | 6 |  |  |  |  |  |  |  |

## Notes
- 
`;

const budget = `---
type: budget
icon: 💰
cover: violet
month: {{date:YYYY-MM}}
tags: [budget]
---
Add what comes in and what goes out; the card works out the rest.

\`\`\`budget
currency:
categories: Rent, Groceries, Bills, Transport, Subscriptions, Eating out, Health, Fun, Other
\`\`\`

## Income
| Date | Source | Amount |
|---|---|---:|

## Expenses
| Date | What | Category | Amount |
|---|---|---|---:|

## Savings goal
- Goal:
- Saved so far:
`;

const travel = `---
type: trip
destination:
from:
to:
tags: [travel]
---
- **Where:**
- **When:**
- **Who:**
- **Budget:**

## Bookings
| What | Details | Confirmation | Done |
|---|---|---|---|
| ✈️ Flight | | | |
| 🏨 Stay | | | |
| 🚗 Getting around | | | |
| 🛡️ Insurance | | | |

## Packing list
**Documents**
- [ ] Passport / ID
- [ ] Tickets & bookings
- [ ] Cards & some cash

**Clothes**
- [ ] Tops
- [ ] Bottoms

**Electronics**
- [ ] Phone charger
- [ ] Adapter
- [ ] Headphones

**Toiletries**
- [ ] Toothbrush & toothpaste
- [ ] Medicines

## Plan, day by day
### Day 1
- **Morning** —
- **Afternoon** —
- **Evening** —

### Day 2
- **Morning** —
- **Afternoon** —
- **Evening** —

## Places to see
- [ ] First place
- [ ] Second place

## Spending
| Date | What | Amount |
|---|---|---|
| | | |

## Before leaving
- [ ] Check in online
- [ ] Download offline maps
- [ ] Water the plants
`;

const jobSearch = `---
type: job-search
icon: 💼
cover: blue
tags: [jobs]
---
Every application is a note of its own. Drag a card to move it along; open it for the details.

\`\`\`jobs
stages: Applied, Phone Screen, Technical, Final, Offer
folder: Applications
\`\`\`

## Notes
- 
`;

const jobApplication = `---
type: job
company:
role:
status: Applied
application_date: {{date:YYYY-MM-DD}}
location:
salary:
link:
tags: [job]
---
## About the role
- **The company:**
- **The job:**

## Requirements
- [ ] A must-have from the posting

## Interviews
### Stage 1
- **Date:**
- **Notes:**

## How I feel about it
- **Pros:**
- **Cons:**

## Next steps
- [ ] Send a follow-up
`;

const weeklyTodo = `---
type: weekly-todo
icon: 🗓️
cover: amber
week: {{date:YYYY-[W]ww}}
tags: [todo]
---
Plan the week day by day. Tick things off; drag what slips to another day.

\`\`\`week
\`\`\`

## Monday
- [ ] Plan the week

## Tuesday

## Wednesday

## Thursday

## Friday

## Saturday

## Sunday

## Review
- **What went well:**
- **What to change:**
- **Next week's top 3:**
`;

export const BUILTIN_TEMPLATES = [
  { id: 'daily', name: 'Daily note', title: '{{date}}', text: daily },
  { id: 'meeting', name: 'Meeting notes', title: '{{date}} Meeting', text: meeting },
  { id: 'project', name: 'Project', title: 'New project', text: project },
  { id: 'projects', name: 'Project board', title: 'Projects', text: projectBoard },
  { id: 'book', name: 'Book notes', title: 'New book', text: book },
  { id: 'habits', name: 'Habit tracker', title: '{{date:YYYY}} Week {{date:ww}} habits', text: habits },
  { id: 'budget', name: 'Budget', title: 'Budget {{date:YYYY-MM}}', text: budget },
  { id: 'travel', name: 'Travel plan', title: 'New trip', text: travel },
  { id: 'todo', name: 'Weekly to-do', title: '{{date:YYYY}} Week {{date:ww}} to-do', text: weeklyTodo },
  { id: 'jobs', name: 'Job search', title: 'Job search', text: jobSearch },
  { id: 'job', name: 'Job application', title: 'New application', text: jobApplication },
];

// The picker's list: the vault's own templates (Templates folder), and the
// built-in ones whose name is not already taken by one of those.
//   userTemplates: [{ rel, title }]
export function templateChoices(userTemplates) {
  const taken = new Set(userTemplates.map((t) => t.title.toLowerCase()));
  return [
    ...userTemplates.map((t) => ({ kind: 'vault', rel: t.rel, name: t.title })),
    ...BUILTIN_TEMPLATES.filter((b) => !taken.has(b.name.toLowerCase())).map((b) => ({ kind: 'builtin', id: b.id, name: b.name })),
  ];
}
