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
tags: [daily]
---
> [!tip] Today's focus
> The one thing that would make today a good day:

## Plan
- [ ] Most important task
- [ ] Second task
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

const weekly = `---
type: weekly-review
week: {{date:YYYY-[W]ww}}
tags: [review]
---
> [!tip] Take 15 minutes
> Look back at the week's plans and daily notes, then choose what matters next week.

## What went well
- A win

## What didn't go well
- Something to change

## What I learned
- An idea worth keeping

## Numbers
| | This week | Goal |
|---|---|---|
| Plans done | | |
| Workouts | | |
| Pages read | | |

## Next week's top 3
- [ ] Priority one
- [ ] Priority two
- [ ] Priority three

## Notes
`;

const project = `---
type: project
status: active
start: {{date:YYYY-MM-DD}}
due:
tags: [project]
---
> [!abstract] Goal
> What does done look like?

## Why it matters
- The difference this makes

## Milestones
- [ ] First milestone
- [ ] Second milestone
- [ ] Done

## Tasks
- [ ] First task
- [ ] Next task

## People & resources
- **Owner:**
- **Links:** [[Related note]]

## Log
- **{{date:YYYY-MM-DD}}** — Started.
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

const recipe = `---
type: recipe
servings: 4
prep: 15 min
cook: 30 min
tags: [recipe]
---
| Servings | Prep | Cook |
|---|---|---|
| 4 | 15 min | 30 min |

## Ingredients
- [ ] First ingredient
- [ ] Second ingredient
- [ ] Third ingredient

## Steps
1. Prepare
2. Cook
3. Serve

> [!tip] Notes
> What to change next time:
`;

const habits = `---
type: habit-tracker
week: {{date:YYYY-[W]ww}}
tags: [habits]
---
> [!tip] How to use
> Tick each habit on the day you do it. Rename or add habits to suit you; the weekly table is for a quick look back on Sunday.

## Monday
- [ ] 💧 Drink 2 litres of water
- [ ] 🏃 Move for 30 minutes
- [ ] 📖 Read 20 pages
- [ ] 😴 In bed by 23:00

## Tuesday
- [ ] 💧 Drink 2 litres of water
- [ ] 🏃 Move for 30 minutes
- [ ] 📖 Read 20 pages
- [ ] 😴 In bed by 23:00

## Wednesday
- [ ] 💧 Drink 2 litres of water
- [ ] 🏃 Move for 30 minutes
- [ ] 📖 Read 20 pages
- [ ] 😴 In bed by 23:00

## Thursday
- [ ] 💧 Drink 2 litres of water
- [ ] 🏃 Move for 30 minutes
- [ ] 📖 Read 20 pages
- [ ] 😴 In bed by 23:00

## Friday
- [ ] 💧 Drink 2 litres of water
- [ ] 🏃 Move for 30 minutes
- [ ] 📖 Read 20 pages
- [ ] 😴 In bed by 23:00

## Saturday
- [ ] 💧 Drink 2 litres of water
- [ ] 🏃 Move for 30 minutes
- [ ] 📖 Read 20 pages
- [ ] 😴 In bed by 23:00

## Sunday
- [ ] 💧 Drink 2 litres of water
- [ ] 🏃 Move for 30 minutes
- [ ] 📖 Read 20 pages
- [ ] 😴 In bed by 23:00

## The week at a glance
| Habit | Goal | Done |
|---|---|---|
| 💧 Water | 7 | /7 |
| 🏃 Move | 5 | /7 |
| 📖 Read | 5 | /7 |
| 😴 Sleep | 6 | /7 |
`;

const budget = `---
type: budget
month: {{date:YYYY-MM}}
currency:
tags: [budget]
---
> [!tip] How to use
> Add each income and expense as a row. At the end of the month, fill in the summary and compare it with your plan.

## Summary
| | Planned | Actual |
|---|---|---|
| **Income** | | |
| **Expenses** | | |
| **Saved** | | |

## Income
| Date | Source | Amount |
|---|---|---|
| {{date:YYYY-MM-DD}} | Salary | |
| | | |

## Expenses
| Date | Category | What | Amount |
|---|---|---|---|
| {{date:YYYY-MM-DD}} | Groceries | | |
| | | | |

## Monthly bills
- [ ] Rent
- [ ] Electricity, water, gas
- [ ] Phone & internet
- [ ] Subscriptions

## Categories
| Category | Planned | Spent |
|---|---|---|
| 🏠 Home | | |
| 🛒 Groceries | | |
| 🚌 Transport | | |
| 🍽️ Eating out | | |
| 🎉 Fun | | |
| 💊 Health | | |

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

export const BUILTIN_TEMPLATES = [
  { id: 'daily', name: 'Daily note', title: '{{date}}', text: daily },
  { id: 'meeting', name: 'Meeting notes', title: '{{date}} Meeting', text: meeting },
  { id: 'weekly', name: 'Weekly review', title: '{{date:YYYY}} Week {{date:ww}} review', text: weekly },
  { id: 'project', name: 'Project', title: 'New project', text: project },
  { id: 'book', name: 'Book notes', title: 'New book', text: book },
  { id: 'recipe', name: 'Recipe', title: 'New recipe', text: recipe },
  { id: 'habits', name: 'Habit tracker', title: '{{date:YYYY}} Week {{date:ww}} habits', text: habits },
  { id: 'budget', name: 'Budget', title: 'Budget {{date:YYYY-MM}}', text: budget },
  { id: 'travel', name: 'Travel plan', title: 'New trip', text: travel },
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
