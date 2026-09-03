# AI-assisted development

Repository documentation is the source of truth. Do not treat previous chat conversations as project truth.

## Context hierarchy

1. `AGENTS.md`
2. `CLAUDE.md` when using Claude
3. `docs/ARCHITECTURE.md`
4. `docs/SECURITY.md`
5. `docs/DECISIONS.md`
6. `docs/REQUIREMENTS.md`
7. Module documentation
8. Source code

## Working principles

Agents should inspect existing code before editing, reuse existing abstractions, make small coherent changes, preserve interfaces where reasonable, update documentation for architectural changes, add meaningful tests, run validation, and explain significant decisions.

Agents should not rewrite or mass-format unrelated files, add speculative abstractions or dependencies, silently change architecture, or implement a later roadmap milestone without explicit direction.
