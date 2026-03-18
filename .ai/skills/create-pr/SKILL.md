---
name: create-pr
description: Automates pull request creation and updates while automatically detecting the base branch and ensuring compliance with repository standards. Used when the user requests to "create a PR," "submit a pull request," or "update the PR description."
disable-model-invocation: false
---

# Role: Pull Request Automation Specialist

You are an engineer specializing in precise command execution based on commit history and automatic detection of base branches.

## 1. Automatic Base Branch Detection (High Priority)

Before creating a pull request, run `git log --oneline --decorate -n 30` and determine the branch to use for the `--base` flag according to the following rules:

- **Detection Rules:**
  1. Look for the first labeled branch name that appears "below" (older than) the current branch (`HEAD -> ...`) in the commit history.
  2. Target names within parentheses, such as `(origin/main, main)` or `(origin/release/..., release/...)`.
  3. **Ignore the current branch name.**
  4. Use the identified name (e.g., `main` or `release/summary-extensions`) as the base branch.
- **Note:** If the base branch cannot be determined with certainty, use `main` as the default.

## 2. Prerequisites (Git/Remote)

- If you are currently on the `main` branch, create and switch to a new branch with a name reflecting the changes before proceeding.
- Ensure that the changes in the current branch have been pushed to the remote.
- If there are unpushed changes, run `git push origin <current_branch>`.

## 3. PR Content Rules

- **Language: The entire PR content (including the title) must be written in English.**
- **Template:** Read `.github/PULL_REQUEST_TEMPLATE.md` and maintain all sections within the description.
- **PR Title Constraints (Conventional Commits):**
  - This project uses `release-please` for automated version management. The PR title **must strictly adhere to the following format**:
  - `<type>(<scope>): <description>` (e.g., `feat(mesugaki-pong): add new character images`)
- **Content Constraints:**
  - **Summary:** Write a concise one-line description.
  - **Changes:** List only code-level changes using bullet points.
  - **Prohibitions:** Do not include task-related items such as "Ran tests," "Confirmed operation," or "Updated README." Also, do not create PRs for direct version number changes or manual CHANGELOG creation.

## 4. PR Creation/Update Process

1.  **Preparation:** Save the PR body text to `tmp/pr_body.txt`.
2.  **Check Existing PR:** Run `gh pr view --json number` to check if a PR already exists for the current branch.
3.  **Create or Update:**
    - If no PR exists: Use the detected base branch and run:
      `gh pr create --base <base_branch> --title "..." --body-file tmp/pr_body.txt`
    - If a PR exists: Run the following (add `--base` if the base branch needs to be changed):
      `gh pr edit --title "..." --body-file tmp/pr_body.txt`
4.  **Verification:** Run `gh pr view --json body --jq .body` to check formatting and line breaks.
5.  **Refinement:** If the formatting is broken, fix `tmp/pr_body.txt` and run `gh pr edit --body-file tmp/pr_body.txt` again.

## 5. Prohibitions

- Do not pass the body directly via the `--body` argument (always use `--body-file`).
- Do not delete sections from the PR template.
