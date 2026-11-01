# ImmiGO Skill Library

**Canonical contract:** [`AGENTS.md`](../../AGENTS.md). Every skill is a task playbook that operates under that contract, not a replacement for it.

Skills are loaded by AI coding tools when a task matches their description. They exist to make the right workflow cheap and the wrong shortcut obvious, regardless of which model is driving.

## How to use a skill

1. Read `AGENTS.md` first. It wins over any skill.
2. Find the feature ID in `docs/features.json`.
3. Load the skill that matches the task.
4. Follow its workflow and satisfy its `## Done when` checklist.
5. Run `npm run verify`.

If a skill conflicts with `AGENTS.md`, `docs/CONSTITUTION.md`, or the code, stop and report the conflict. Do not guess.

## Index

### Change safety

| Skill | Use when |
|---|---|
| [`feature-contracts`](feature-contracts/SKILL.md) | Adding a feature or changing protected behavior |
| [`regression-testing`](regression-testing/SKILL.md) | Fixing a bug or protecting legacy behavior |
| [`refactoring`](refactoring/SKILL.md) | Restructuring code without a behavior change |
| [`release-verification`](release-verification/SKILL.md) | Preparing a merge, release, or handoff |
| [`code-review`](code-review/SKILL.md) | Reviewing a diff, PR, or another model's patch |

### Testing and quality

| Skill | Use when |
|---|---|
| [`test-generation`](test-generation/SKILL.md) | Writing unit, component, contract, integration, or E2E tests |
| [`ai-prompt-evaluation`](ai-prompt-evaluation/SKILL.md) | Changing a prompt, model, rubric, or grading rule |
| [`debugging-root-cause`](debugging-root-cause/SKILL.md) | Diagnosing a failure, stack trace, or broken request |
| [`typescript-strict`](typescript-strict/SKILL.md) | Resolving type errors or modeling external data |

### Architecture and backend

| Skill | Use when |
|---|---|
| [`api-development`](api-development/SKILL.md) | Changing an API route, handler, or contract |
| [`aws-serverless`](aws-serverless/SKILL.md) | Changing Amplify, Lambda, API Gateway, IAM, or storage |
| [`schema-data-modeling`](schema-data-modeling/SKILL.md) | Changing Supabase schema, RLS, queries, or types |
| [`security-best-practices`](security-best-practices/SKILL.md) | Touching auth, secrets, input validation, or sensitive data |
| [`infrastructure-awareness`](infrastructure-awareness/SKILL.md) | Discussing limits, latency, concurrency, or topology |
| [`performance-optimization`](performance-optimization/SKILL.md) | Addressing measured latency, bundle, or cold-start cost |
| [`error-handling-logging`](error-handling-logging/SKILL.md) | Changing failure responses, diagnostics, or logs |

### Frontend and content

| Skill | Use when |
|---|---|
| [`react-vite-frontend`](react-vite-frontend/SKILL.md) | Changing components, hooks, contexts, or Vite config |
| [`styling-ui-ux-a11y`](styling-ui-ux-a11y/SKILL.md) | Changing layout, Tailwind, responsive behavior, RTL, or a11y |
| [`technical-documentation`](technical-documentation/SKILL.md) | Writing docs, ADRs, TSDoc, or runbooks |
| [`codebase-understanding`](codebase-understanding/SKILL.md) | Explaining how something works or where it lives |
| [`pattern-based-generation`](pattern-based-generation/SKILL.md) | Scaffolding a new structure from a working example |
| [`dependency-management`](dependency-management/SKILL.md) | Adding, removing, or upgrading a package |

## Skill quality bar

Every `SKILL.md` must:

- Start with YAML frontmatter containing `name` and a specific `description` that says when to use it.
- Link to `AGENTS.md`.
- State project-specific rules, not generic advice a model already knows.
- Include a workflow with concrete commands or file paths.
- End with a `## Done when` checklist that can be verified.
- Stay short enough to load into context. Move detail into `docs/` and link it.

A skill must not:

- Duplicate the full contents of `AGENTS.md`.
- Contradict the code, the registry, or an ADR.
- Recommend Express, `serverless-http`, a new state library, or a new runtime dependency.
- Tell a model to skip, weaken, or delete a test.
- Contain secrets, real credentials, or production data.

## Adding a skill

1. Confirm no existing skill covers the task. Extend an existing skill before adding a new one.
2. Create `.agents/skills/<name>/SKILL.md`.
3. Add frontmatter with a precise `description`.
4. Link `AGENTS.md` and the relevant feature IDs.
5. Add the skill to the index above.
6. Run `npm run verify:governance` to confirm frontmatter and `## Done when`.
7. Run `npm run verify`.

## Removing or merging a skill

- Remove a skill when its guidance is obsolete, duplicated, or contradicts the current architecture.
- Merge overlapping skills instead of keeping two sources of truth.
- Update this index in the same change.
- Do not remove a skill that protects a protected behavior without moving its rules into `AGENTS.md`, `docs/`, or a surviving skill.

## Maintenance

Review the library when:

- An ADR changes an architecture boundary.
- A feature is added, deprecated, or reclassified.
- A test command or verification step changes.
- A skill caused a wrong or stale recommendation.
- A new AI tool needs an adapter. Add the adapter at the repository root and point it to `AGENTS.md`; do not fork the rules.

The governance check enforces the mechanical rules. The quality bar above is a review responsibility.
