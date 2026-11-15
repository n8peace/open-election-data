# Model side evals

`cases.jsonl` is a small regression set for checking whether a research model puts real quotes on the human-approved side of each issue dial. It does not test source discovery or quote verification.

Run the current research pipeline's default backend with:

```sh
npm run eval
```

Override it with any research backend name, for example:

```sh
npm run eval -- --model gateway:openai/gpt-5.6-luna
```

The command calls models and may cost money. It prints `PASS` or `FAIL` for every case, prints the total, and exits with status 1 if any case fails.

Cases may come only from work a person checked or from a real past bug. Never invent a case or its expected side.

## Baseline

2026-11-14, default research model: 31/35. Three real disagreements with the reviewed answer (Becerra energy, DeSaulnier wages and housing: the model said "neither side" or the opposite of what the reviewer approved) and one model call that returned nothing (ERROR). A new model should beat 31 before it replaces the default.
