---
name: ai-prompt-evaluation
description: Use when changing an ImmiGO prompt, model, grading rubric, matching rule, or LLM-backed behavior. Builds a golden set, runs the eval, compares models, and prevents quality regressions.
---

# AI Prompt Evaluation

**Read first:** [`AGENTS.md`](../../../AGENTS.md), `docs/CONSTITUTION.md` section on grading, `docs/FEATURES.md` (F-05, F-06), and `eval/civics/`.

Use this skill for any change to a prompt, system message, model ID, temperature, rubric, matching rule, or model-backed response path. A prompt change is a behavior change.

## Core rules

- Deterministic policy belongs in code, not in a prompt. If a rule can be a test, make it a test.
- A prompt change requires an eval run before and after. "It looks better" is not evidence.
- Do not tune the prompt against a single example. Use a golden set with known expected outcomes.
- Do not change the eval threshold to fit a worse result. Review the threshold with the prompt change.
- Keep the model ID and prompt version identifiable in the request or logs, without logging user content.
- The model may phrase feedback; it may not decide a recorded verdict. `graded_answers` remains authoritative.
- Never send secrets, raw authorization headers, or unnecessary PII to Bedrock or any model provider.

## Build the evaluation set

Cover, at minimum:

1. Clearly correct answers, including alternate accepted answers.
2. Partial answers that must not be marked correct.
3. Clearly incorrect answers.
4. Near-miss and adversarial answers (wrong branch, wrong number, negation).
5. Confirmation, hint, repeat, and progress-question turns.
6. Ambiguous or off-topic input.
7. Empty, very short, and very long input.
8. Non-English or mixed-language input where supported.

Each case needs an expected outcome and a short reason. Store cases as data, not as prose in a prompt.

## Evaluation method

- Prefer deterministic assertions for grading verdicts and routing.
- Use model-graded or human-graded rubrics only for qualitative prose, with an explicit rubric and scale.
- Run each case more than once when the model is nondeterministic; report variance, not a single lucky run.
- Compare against the current baseline, not against perfection.
- Record failures with the input, expected outcome, actual outcome, and model/prompt version.
- Check cost and latency impact for any model change.

## Project commands

```bash
npm run eval:civics
npx vitest run amplify/functions/transcript/turn/__tests__/turn-policy.test.ts
npx vitest run amplify/functions/transcript/turn/__tests__/turn-interpreter.prompts.test.ts
```

Do not invent an eval command. If one is missing, add it to `package.json` and `docs/TESTING.md` in the same change.

## Workflow

1. Identify the feature ID and the behavior the prompt controls.
2. Capture the baseline eval result.
3. Add failing deterministic tests for any rule that can be code.
4. Change the prompt or model in the smallest possible way.
5. Re-run the eval and compare case by case.
6. Investigate every regression; do not average it away.
7. Run `npm run verify`.
8. Record the baseline, the new result, variance, cost, and residual risk in the change receipt.

## Done when

- [ ] The behavior is represented in the golden set.
- [ ] Deterministic rules are tested in code, not only in the prompt.
- [ ] Baseline and post-change eval results are recorded.
- [ ] No case regressed without a documented, approved reason.
- [ ] The threshold was reviewed with the change, not adjusted afterward.
- [ ] Cost and latency impact are noted.
- [ ] No secret or unnecessary PII is sent to the model.
- [ ] `npm run verify` passes.
