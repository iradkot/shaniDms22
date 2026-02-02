---
name: pr-review-comment-triage
description: 'Pulls GitHub PR review comments for the current branch, evaluates validity, fixes issues, resolves addressed threads, and replies when comments are not applicable or need clarification. Use when asked to triage PR review comments, check if they are valid, fix them, or respond with context. Also use when user mentions they received comments on a PR or asks you to review/handle PR feedback.'
---

# PR Review Comment Triage

This skill automates end-to-end handling of PR review comments for the current branch: detect a PR, fetch open review comments, evaluate each, fix issues when appropriate, resolve threads after fixes, and reply when comments are not applicable or need clarification.

## When to Use This Skill

Trigger this skill when the user:
- Explicitly asks to "check PR review comments", "triage review comments", "fix review comments", or "resolve PR comments"
- Mentions they "got comments" or "received feedback" on a PR
- Says things like "please review them" (referring to PR comments)
- Asks to "handle PR feedback", "address review comments", or "look at the PR comments"
- Mentions "Copilot reviewed" or "reviewer left comments"
- Asks to "fix what the reviewer said" or "address the review"
- References PR comments implicitly with phrases like "there are comments on our PR"

**Key trigger phrases:**
- "got some comments on our PR"
- "please review them" (in PR context)
- "review comments need addressing"
- "PR has feedback"
- "check the comments"
- "fix review comments"
- "triage PR comments"
- "handle the review"

## Prerequisites

- GitHub CLI (`gh`) installed and authenticated.
- Repository has a PR associated with the current branch.
- You can run tests/builds if needed to validate fixes.

## Step-by-Step Workflow

### 1) Identify the PR for the current branch
1. Determine the current branch name.
2. Use `gh pr view` to locate a PR for the branch.
3. If no PR exists, stop and report: “No PR found for current branch.”

### 2) Fetch open review comments and threads
1. Use proper GraphQL syntax with `-f` and `-F` flags (single quotes, no double quotes around query).
2. Use the **reviews GraphQL endpoint** to fetch all review comments with their thread status:
   ```bash
   gh api graphql -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviews(last:100){nodes{id author{login} body state comments(last:50){nodes{id body author{login} path line}}}}}}}' -F owner="OWNER" -F name="REPO" -F number=PR_NUMBER
   ```
3. **Filter to unresolved threads only**:
   - For each review, check if it already has a reply from the PR author (you) in a subsequent review.
   - Skip review comments where the author is **not** the reviewer bot (e.g., `copilot-pull-request-reviewer`).
   - A thread is considered **resolved** if:
     - There is a reply from the PR author addressing it, OR
     - The thread was explicitly marked as resolved via GitHub UI/GraphQL.
   - To check explicit resolution status, use the `reviewThreads` query (if available) and filter by `isResolved: false`.
4. Group remaining **unresolved** comments by file and thread for context.
5. **Identify new comments** by comparing timestamps: comments created after the last commit on the branch are likely new and need attention.

### 3) Evaluate each comment (Critical: Be skeptical)
For each comment or thread:
- **Do NOT accept comments at face value** — critically evaluate whether it is valid and truly requires a code change.
- Ask: "Is this a real issue or just a style preference? Does this comment target a symptom or the root cause?"
- If valid:
  - Identify required files/logic.
  - **Check for deeper issues**: If the fix seems like a patch, consider if a more fundamental refactor is needed.
  - If a patch would only mask the real problem, escalate the approach decision (ask in chat, don't just patch).
  - Make targeted changes aligned with the actual root cause.
  - Run relevant tests if needed (unit/integration/e2e where applicable).
- If not valid:
  - Draft a clear response explaining why it does not apply.
  - Provide evidence (links, reasoning, or test results).
- If ambiguous or suggests root refactor:
  - Ask focused clarification questions in the PR thread.
  - **Explain the generalized fix** vs. the patch approach and ask which is preferred.

### 4) Apply fixes (if needed)
- Implement code changes.
- Re-run appropriate tests.
- Capture outputs relevant to the comment.

### 4.5) Commit and push (when authorized)
- If the user has authorized commits/pushes, commit the fixes and push them to the PR branch **before** replying/resolving.
- This ensures your thread replies can reference an actual commit SHA and reviewers can immediately see the updated code.

### 5) Respond and resolve each thread
**Critical**: For **each unresolved comment thread**, you must:
1. **Post a reply** to the specific comment thread explaining the fix or reasoning
   - Use `gh pr review --comment-id COMMENT_ID` to reply directly to the comment thread
  - OR use GraphQL `addPullRequestReviewThreadReply` mutation to add a reply
   - OR use `gh pr comment 11` to post a general comment first, then resolve threads
2. **Resolve the thread** after replying
   - Fetch the thread ID: `gh api graphql -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:10){nodes{id isResolved}}}}}' -F owner="OWNER" -F name="REPO" -F number=PR_NUMBER`
   - Resolve using GraphQL mutation: `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}' -F id="THREAD_ID"`

Process flow:
- **If fixed**: Commit + push (if authorized) → Reply in thread with fix summary (include commit/tests) → Resolve thread
- **If not applicable**: Reply with explanation → Do not resolve (let reviewer decide)
- **If needs clarification**: Reply with questions → Keep thread open for response

## Decision Rules

- **Fix** if it affects correctness, safety, user experience, or maintainability.
- **Defer** if it’s a style preference without project-wide standard.
- **Reject** only with clear evidence or intent mismatch.
- **Ask** if the requested change conflicts with current architecture or is unclear.
- **Escalate for broader refactor** if the fix would be a patch that masks a deeper architectural or design issue—describe both the patch and root-cause approach in chat and ask before proceeding.

## Handling Duplicate or Already-Addressed Comments

When a comment appears to be a duplicate of a previously addressed issue:
1. **Verify**: Check if the underlying issue was already fixed in a previous commit or is no longer relevant due to code changes.
2. **Reply**: Post a brief reply noting the status:
   - "This was addressed in commit [hash] / previous review round."
   - "This code was removed/changed - comment no longer applies."
3. **Resolve**: Mark the thread as resolved after replying.

**Important**: Every comment must receive either a reply + resolution (if addressed) or a reply without resolution (if needs discussion). Never skip comments or leave them in limbo.

## Checklist Before Completing Triage

- [ ] All unresolved threads have been evaluated
- [ ] Each comment has either been: fixed + resolved, rejected with reply, or left open with clarifying question
- [ ] No comment was silently skipped or marked as "duplicate" without a reply
- [ ] Tests pass after all fixes
- [ ] Changes committed and pushed
## Recommended GitHub CLI Commands

- Find PR for current branch:
  - `gh pr view --json number,headRefName,title,url`
- **Fetch all reviews with comments** (preferred for detecting new comments):
  ```bash
  gh api graphql -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviews(last:100){nodes{id author{login} body state submittedAt comments(last:50){nodes{id body author{login} path line}}}}}}}' -F owner="OWNER" -F name="REPO" -F number=PR_NUMBER
  ```
- **Identify unresolved comments**:
  - Look for reviews from `copilot-pull-request-reviewer` (or other reviewers).
  - Check if a subsequent review from the PR author (you) replies to the same file/line.
  - If no reply exists, the comment is unresolved.
- Reply to a thread:
  - `gh pr review --comment-id COMMENT_ID` (reply to specific comment)
  - `gh api graphql` (post comment via GraphQL mutation)
  - `gh pr comment` (post general comment on PR)
- Resolve thread:
  - Fetch thread IDs: `gh api graphql -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:10){nodes{id isResolved}}}}}' -F owner="OWNER" -F name="REPO" -F number=PR_NUMBER`
  - Resolve with mutation: `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}' -F id="THREAD_ID"`

## Response Templates

### Fixed
“Fixed in [commit/changes]. Re-ran relevant tests: [tests]. Resolving.”

### Not Applicable
“Thanks! I reviewed this and it’s not applicable because [reason]. If you’d like a different approach, happy to adjust.”

### Needs Clarification
“Can you clarify [specific point]? I want to make sure the fix aligns with your intent.”

## Troubleshooting

- **No PR found**: Ensure branch is pushed and has an open PR.
- **No open threads**: Report that there are no unresolved comments.
- **Permission errors**: Confirm `gh auth status` and repository access.
- **Cannot resolve threads**: Ensure the token has `pull_request:write` permissions.
- **GraphQL syntax errors** (`Expected VAR_SIGN, actual: BANG...`):
  - **Root cause**: Double quotes around the query string cause shell escaping issues with GraphQL variable syntax (`$var!`).
  - **Solution**: Use the `-f` flag for inline query strings, NOT double quotes. Example:
    ```bash
    gh api graphql -f query='query($owner:String!,$name:String!){...}' -F owner="iradkot" -F name="genetic-algorithm-stock-academy"
    ```
  - The `-F` flag automatically quotes string variables, avoiding shell interpretation of `!` characters.
  - If using `-f query="..."` instead of `-f query='...'`, the shell interprets `!` as history expansion, breaking the query.

## References

- GitHub CLI PR docs: https://cli.github.com/manual/gh_pr_view
- GitHub GraphQL API: https://docs.github.com/en/graphql
