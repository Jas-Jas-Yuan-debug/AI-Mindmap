# AI-Mindmap

## 🛑 Read this first, every session

Before you do anything else — **read [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) from top to bottom.** It defines the product, the phases, the tech stack, the file format, the architecture, and the exit criteria for every milestone. This `CLAUDE.md` covers workflow (Git, collaboration, conflicts); the plan covers *what we are building and in what order*. Both are mandatory.

**Conflict resolution:**
- If `CLAUDE.md` and `DEVELOPMENT_PLAN.md` disagree on **workflow** (Git, PRs, branches, collaboration) → `CLAUDE.md` wins.
- If they disagree on **product, architecture, or tech choices** → `DEVELOPMENT_PLAN.md` wins.

**Never start work that contradicts the plan without first opening a PR that amends the plan.** No silent scope drift.

## 📝 Keep the plan current — at all times

`DEVELOPMENT_PLAN.md` is a **living document**. Every PR is responsible for keeping it accurate. There is no separate "documentation pass" later.

**You MUST update `DEVELOPMENT_PLAN.md` in the same PR when your change:**
- Adds, removes, or reorders a phase
- Changes any phase's deliverables or exit criteria
- Adds, removes, or swaps a tech-stack entry (library, framework, build tool)
- Modifies the file format, IPC contract, or Platform interface
- Changes the directory layout
- Marks a phase complete (update the phase header with 🟢 done + date, link to PRs)
- **Satisfies one or more exit criteria of any in-flight phase** (tick the relevant `[ ]` → `[x]` checkboxes, append the PR number that landed it, e.g. `[x] npm run lint passes (PR #28)`)
- Reveals that a previously locked decision was wrong (write the new decision AND a one-line "previously decided X because Y; superseded because Z")

**You MAY skip a plan update only when your change is purely:** a bug fix that doesn't change behavior described in the plan AND doesn't satisfy any open exit criterion, a typo, a comment-only edit, a test-only addition that doesn't satisfy an exit criterion, or a dependency patch-version bump.

**Sequencing:** if a change is large enough to need debate (new phase, dropping a library, changing the file format), open a **plan-amendment PR first** with just the doc change. Get it merged. Then open the implementation PR referencing the now-merged plan.

**Progress tracking — the plan is the dashboard.** Anyone reading `DEVELOPMENT_PLAN.md` should be able to see, by scanning the exit-criteria checkboxes, exactly what's shipped and what's left for the current phase. Don't let the plan say `[ ]` when reality says ✅. When ticking a box, also bump the "Last updated" footer with a one-line history entry summarizing what landed.

**Drift check:** at the start of every session, after `git pull`, skim the diff between the plan's "last updated" date and `HEAD` of `main` for any recent merges. If a merged PR changed behavior the plan describes but didn't update the plan (including unticked exit criteria for shipped work), **your first PR of the session is the plan correction.**

## Tech stack

This is a **multi-platform application**: an **Electron desktop app** (macOS / Windows / Linux) AND a **web app** (browser SPA), built from a single React + Konva renderer codebase. Platform differences live behind a `Platform` adapter — see `DEVELOPMENT_PLAN.md` §4 for the contract.

Currently in transition from the original vanilla-JS Electron scaffold (Chromium renderer + Node.js main process) to the TS/React/Vite/Konva stack defined in `DEVELOPMENT_PLAN.md` §3. Phase 0 is the migration.

### Layout

```
AI-Mindmap/
├── package.json              # entry: src/main/main.js, scripts.start = "electron ."
├── src/
│   ├── main/
│   │   ├── main.js           # main process: app lifecycle, BrowserWindow
│   │   └── preload.js        # contextBridge — exposes safe APIs to renderer
│   └── renderer/
│       ├── index.html        # main UI document, loaded by BrowserWindow
│       ├── renderer.js       # renderer-side logic
│       └── style.css
├── assets/                   # icons, static images (created when needed)
└── CLAUDE.md
```

### Security defaults (do not relax without coordination)

`BrowserWindow.webPreferences`:
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `preload: path.join(__dirname, 'preload.js')`

Any renderer ↔ main IPC goes through `contextBridge.exposeInMainWorld` in preload + `ipcMain.handle` in main. The renderer must never `require('electron')`.

### Running locally

```
npm install
npm start          # launches Electron
```

Node ≥ 18 recommended (matches current Electron toolchain).

### Build / packaging

Not wired up yet. When we add it, prefer `electron-builder` and put output under `dist/` (already gitignored). Coordinate before introducing any packager — it touches `package.json` and CI.

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
- **Self-merge is the default, not an option.** After opening a PR, the same agent immediately runs the self-merge checklist (see below) and merges. Do not pause to ask the user "should I merge?" — opening a PR implies the intent to land it. Only hold a PR open if (a) it's marked `[WIP]` / `[BLOCKED]`, (b) it touches the same files as another agent's open PR (Scenario D), or (c) the user explicitly says "wait."

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

The two agents work **asynchronously** — never in the same session, no live chat. The channels are: **GitHub Issues** (the primary async discussion channel), branch names, commit messages, PR descriptions, PR comments, and in-code `NOTE(agent-x):` comments. Treat every artifact you create as a message to the other agent.

### Starting a session — always do this first
1. `git fetch --all --prune` — see what the other agent has been up to.
2. `git branch -r` — list remote branches. Anything under the *other* agent's prefix is work in flight.
3. **`gh issue list --state open` — read every open issue.** If any issue is addressed to you, asks a question, requests a decision, or proposes something you'd otherwise duplicate or contradict, **reply before doing anything else**. See "Issues are first-class" below.
4. `gh pr list` — read open PRs (titles + descriptions) to understand what's currently being worked on or waiting to merge.
5. `git log origin/main -10` — skim recent commits on `main` for context that didn't exist last session.

Only after these steps, decide what to work on.

### Issues are first-class — reply before you ship

**Open issues take priority over new work.** Before you start coding, before you open a new PR, before you touch shared files: answer any open issue that's waiting on you. The other agent can't move forward while waiting — leaving an issue unanswered is the equivalent of holding the conch.

Concretely:
- **Triage every open issue at session start.** For each one, decide: answer now, defer with an explicit ETA comment, or close as resolved/obsolete.
- **If an issue is a decision request, give the decision.** Don't reply "let me think about it" without a follow-up comment within the same session. Defaults proposed by the other agent are presumed accepted if you don't push back — but it's still better to acknowledge explicitly so they know you saw it.
- **If you already shipped work that affects an open issue, comment on the issue immediately** — explain what landed, link the PR, and answer any open questions in context. Don't make the other agent piece it together from the merge.
- **Open an issue yourself when a decision affects the other agent.** Don't make load-bearing choices unilaterally (architecture, file format extensions, shared types, build config) without giving the other agent a chance to weigh in. Default response window: ~24h. If they don't reply, proceed and note "no objection within window" in the eventual PR.
- **Close issues when resolved.** Leaving stale "open" issues on the tracker wastes the other agent's triage time next session.

When using issues as your channel:
- Keep titles scoped (`Phase 0 — open decisions` is good; `discussion` is not).
- One topic per issue — don't pile unrelated questions into one thread.
- Number questions (Q1, Q2…) so replies can `✓` per question.
- Link related PRs from both directions (PR body cites issue, issue cites PR).

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

### Conflict scenarios — what to do in each

Before you start resolving, **identify which scenario you're in.** The right action differs.

#### Scenario A: different files
You changed `parser.py`, the other agent changed `render.py`. Git auto-merges — no action needed.

#### Scenario B: same file, different lines
You changed line 100 of `app.py`, the other agent changed line 10. Git auto-merges during rebase. Just run:

```
git fetch origin
git rebase origin/main
git push --force-with-lease    # rewriting your branch's history, safe because no one else is on it
```

#### Scenario C: same file, same lines (real conflict)
Git stops mid-rebase and marks the file with conflict markers:

```
<<<<<<< HEAD
print("hello")       # the other agent's version (currently on main)
=======
print("hi")          # your version
>>>>>>> your-branch
```

Resolution steps:

```
# 1. Open the file. Pick one side, combine both, or write something new.
#    Delete ALL of <<<<<<<, =======, >>>>>>> markers.

# 2. Mark the file resolved
git add path/to/file.py

# 3. Continue the rebase
git rebase --continue

# 4. Repeat if more conflicts surface
# 5. Push with --force-with-lease (history was rewritten)
git push --force-with-lease
```

If the rebase gets out of hand or you picked wrong:

```
git rebase --abort    # safe escape — back to where you started
```

Then think again, or comment on the PR asking the other agent for input.

#### Scenario D: both agents currently have an open PR touching the same file
**Stop before you write code.** This is the worst case and the easiest to prevent.

Detect it at session start:
```
git fetch --all --prune
gh pr list --state open
# For each open PR, check the files it touches:
gh pr view <N> --json files -q '.files[].path'
```

If the other agent's open PR touches a file you planned to edit:
1. Don't start your edit.
2. Comment on their PR: "I was going to change X in this file too — should I wait, or do you want me to take over?"
3. Wait for resolution (or, if the other agent is offline and you can't wait, take over their branch and finish the work yourself, crediting them in the commit).

#### Quick decision tree

```
Did you both edit the same file?
├─ No  → Scenario A. Git handles it.
└─ Yes → Is the other agent's PR already merged to main?
         ├─ Yes → Same lines?
         │        ├─ No  → Scenario B. git rebase origin/main, done.
         │        └─ Yes → Scenario C. Resolve markers, git add, git rebase --continue.
         └─ No  → Scenario D. STOP. Coordinate via PR comment before writing more code.
```

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

## Telemetry — NONE (Phase 8)

AI-Mindmap collects **no telemetry**. The app does not phone home, has no
analytics, no crash reporting, no usage tracking, and no accounts. All state is
local: documents on disk, preferences in `localStorage` (web) / userData
(Electron). Any future feature that would send data off-device requires a §1
plan amendment AND must be opt-in. This is a product invariant (see
`DEVELOPMENT_PLAN.md` §2 "Local-first" + §1 "What we are NOT building — ever").
