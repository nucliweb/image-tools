# Contributing

`image-tools` is a reproducible toolbox and comparison harness for image codecs and
quality validation. This document defines how we work so the history stays clean and
the results stay trustworthy.

## Commit convention

We use [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>(<optional scope>): <short summary>

<optional body>

<optional footer>
```

Types used in this repo:

| Type | Use for |
| --- | --- |
| `feat` | New capability of the toolbox or harness |
| `fix` | Correcting broken behavior |
| `build` | Dockerfile, build stages, packaging |
| `docs` | README, ADRs, inventory, any prose |
| `test` | Smoke tests / verification scripts |
| `chore` | Tooling, gitignore, meta |
| `refactor` | Behavior-preserving code changes |

Rules:

- One logical change per commit; keep them atomic and reviewable.
- Imperative mood in the summary (`add`, not `added`).
- The Dockerfile and any executable are committed **only after runtime verification**
  (see below), never on a green build alone.

## Branching

- `main` is always in a working, verified state.
- Work happens on short-lived branches: `feat/…`, `fix/…`, `build/…`, `docs/…`.
- Open a PR into `main`; squash or rebase to keep history linear and legible.

## Verification (definition of done)

A change is not done until it is **proven at runtime**, not merely built.

- A green `docker build` is necessary but **not** sufficient. Piping build output
  through another command can mask a non-zero exit; always check the real build status.
- After building the image, exercise the tools: run `smoke-test.sh` inside the
  container to confirm every encoder, decoder, and metric actually executes.
- Only then is the corresponding change eligible to be committed.

## AI-assisted development

This project is developed with AI coding agents, transparently.

- **Design decisions** are recorded as ADRs under `decisions/` and committed. The
  history should honestly reflect how and why choices were made.
