# AI-Mindmap

## Repository access

The user (GitHub: `jonzhucom`) is a **collaborator** on this repository, not the owner.
Repo: https://github.com/Jas-Jas-Yuan-debug/AI-Mindmap (owner: `Jas-Jas-Yuan-debug`)

Implications:
- Push directly to `main` or feature branches — no fork needed.
- Other collaborators may push too; run `git pull` before starting work.
- Coordinate before force-pushing, rewriting history, or changing repo-wide settings.

## Project model: AI-Agent-Led

This repository is **AI-Agent-Led**. Humans will not intervene in the code.

- Contributors: **2 AI agents** are the sole contributors to this repo.
- All design, implementation, review, and maintenance decisions are made by the agents.
- Do not defer to a human for code-level choices — make the call, document the reasoning in the commit/PR, and proceed.
- Coordination between the two agents happens through the repo itself: commits, PRs, branch names, and in-code comments are the communication channel. Be explicit in commit messages and PR descriptions so the other agent has full context.

## Git workflow rules

These rules apply to **both AI agents**. Follow them strictly — they exist so neither agent overwrites the other's work or leaves `main` in a broken state.

### Branching
- **Never commit directly to `main`.** All work happens on a feature branch and lands via PR.
- **Branch naming:** `<agent-id>/<short-kebab-description>`, e.g. `agent-a/add-graph-renderer`, `agent-b/fix-export-crash`. The prefix makes ownership obvious at a glance.
- **One task, one branch.** Keep branches short-lived (hours to a few days). Don't pile unrelated work onto the same branch.
- **Before starting work:** `git fetch --all && git pull --rebase origin main` so you branch off the latest `main`.

### Commits
- Commit after every completed, working unit of work — don't batch up days of changes into one commit.
- Commit messages: one-line subject (imperative, ≤ 72 chars), blank line, then a body that explains **why**, not just what. The body is the primary channel for the other agent to understand your intent.
- Never commit secrets, `.env` files, large binaries, or generated artifacts (`dist/`, `node_modules/`, `__pycache__/`, etc.).
- Prefer `git add <specific-files>` over `git add -A` to avoid sweeping in junk.

### Pull requests
- **Every change goes through a PR**, even small ones — it's how the other agent sees the diff.
- PR description must include: what changed, why, how it was tested, and any follow-ups left for the other agent.
- If a PR touches an area the other agent is actively working on, note it in the description and check their open branches first (`git branch -r`).
- **Self-merge is allowed** (only two agents, no human reviewer), but only after: CI/tests pass locally, the diff has been re-read, and the branch is rebased on current `main`.

### Staying in sync
- Run `git fetch` at the start of each session so you see the other agent's branches.
- Before merging your PR: `git pull --rebase origin main` on your branch, resolve conflicts, then merge.
- Prefer **rebase** over merge commits to keep history linear and easy to read.

### Things that require coordination first
Do **not** do any of these without leaving a note in a commit/PR/issue so the other agent sees it coming:
- Force-push (`git push --force` / `--force-with-lease`) to any branch the other agent might be using.
- Rewriting history on `main` or any shared branch (`git rebase -i`, `git reset --hard` on pushed commits).
- Deleting branches that aren't your own.
- Changing repo-wide settings, default branch, branch protection, or CI config.
- Large dependency upgrades or framework changes that affect the whole codebase.

### Worktrees (optional)
Branches are the required coordination tool. **Worktrees are optional** and only useful when a single agent needs to work on multiple branches in parallel (e.g. long-running build on branch A while starting branch B). Skip them unless you hit that need.

## Collaboration & conflict handling

The two agents work **asynchronously** — never in the same session, no live chat. The only channels are: branch names, commit messages, PR descriptions, PR comments, and in-code `NOTE(agent-x):` comments. Treat every artifact you create as a message to the other agent.

### Starting a session — always do this first
1. `git fetch --all --prune` — see what the other agent has been up to.
2. `git branch -r` — list remote branches. Anything under the *other* agent's prefix is work in flight.
3. `gh pr list` — read open PRs (titles + descriptions) to understand what's currently being worked on or waiting to merge.
4. `git log origin/main -10` — skim recent commits on `main` for context that didn't exist last session.

Only after these steps, decide what to work on.

### Claiming a task (so the other agent doesn't duplicate or collide)
- **Push your branch early.** As soon as you have one meaningful commit, push it (even WIP). The branch name + first commit message tells the other agent "this area is being worked on."
- **Open a draft PR early** for non-trivial work. Title prefix `[WIP]` and a description that states the intent, scope, and files you expect to touch. This is your public "claim."
- If you start work and discover the other agent already has an open PR in the same area: stop, comment on their PR with what you intended to do, and either help on their branch or wait for it to merge.

### Avoiding conflicts before they happen
- **Don't both edit the same file at the same time.** Before editing a file, grep open PRs / remote branches for its name. If the other agent is touching it, coordinate via PR comment first.
- **Keep PRs small and focused.** A 50-line PR rarely conflicts; a 2000-line PR almost always does.
- **Merge fast.** Open PRs are landmines for the other agent. Don't let a PR sit open for more than ~24 hours without progress — either finish it, mark it `[BLOCKED]`, or close it.

### Resolving conflicts when they do happen
- **Last-to-merge resolves.** Whoever's PR is merging second is responsible for rebasing on `main` and resolving conflicts. Never force the first-merger to redo their work.
- **Preserve both intents when possible.** Read both sides of the conflict; if they're solving different problems, keep both. Only drop the other agent's change if it's clearly superseded by yours — and say so explicitly in the merge commit body.
- **When unsure who's right, don't guess.** Leave the conflict markers in place, push the branch, and open a comment on the PR explaining the conflict. The other agent (or a follow-up session) decides.
- **Document non-obvious resolutions** in the merge commit body: what was conflicting, what you chose, why.

### Communication patterns (use these explicitly)

| Situation | Channel | Format |
|---|---|---|
| "I'm starting work on X" | Branch name + draft PR | `claude/add-x`, PR title `[WIP] Add X` |
| "I'm blocked on Y, need your input" | Draft PR title | `[BLOCKED] Add X — need decision on Y` with details in body |
| "I made a non-obvious design choice" | Commit body | Explain the alternatives considered and why this one |
| "Don't touch this section yet, I'll explain later" | In-code comment | `// NOTE(claude): leaving the foo() stub until bar refactor lands, see PR #N` |
| "Heads up about something repo-wide" | Issue or PR description | Open a GitHub issue and reference it from related PRs |
| "I disagree with a decision in main" | New PR that changes it | Don't argue — propose the change with reasoning. The other agent reviews. |

### Decision authority
- **Code-level decisions** (naming, file layout, library choice, refactor scope): whoever's working on it decides. Document the reasoning in the commit/PR so the other agent can challenge it later if needed.
- **Architectural decisions** (data model, framework, public APIs, anything that affects both agents' future work): open an issue first, give the other agent a chance to weigh in via comment, then proceed if no objection within ~24h.
- **Reversing the other agent's recent decision**: allowed, but the PR description must explain *why* the previous approach didn't work. Don't silently overwrite.

### When the other agent's work looks wrong
- Don't revert silently. Open a PR that fixes it, and explain in the description what was wrong and why your fix is better.
- If it's a small mistake (typo, obvious bug): just fix it in your next PR, mention it in the body.
- If it's a design disagreement: open an issue, lay out both approaches, then act on the resolution.

### Self-merge discipline
Since either agent can self-merge, the merge step is where mistakes compound. Before clicking merge:
1. Re-read your own diff once more, cold.
2. Confirm the branch is rebased on current `origin/main`.
3. Confirm no other agent's open PR touches the same files (if it does — comment there first).
4. Confirm tests/CI pass locally.
5. Merge, then delete the branch (local + remote) immediately.
