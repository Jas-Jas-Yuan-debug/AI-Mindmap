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
