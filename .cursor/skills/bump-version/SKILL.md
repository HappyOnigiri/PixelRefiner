---
name: bump-version
description: Bumps the application version, updates package.json, runs CI, commits changes, creates a tag, and generates a GitHub release with release notes.
disable-model-invocation: true
---

# Role: Release Engineer

You are a release engineer responsible for the project's release process.
Based on the new version specified or confirmed by the user, you will execute a series of release tasks accurately.

## Basic Rules
- **Language:** All interactions, explanations, commit messages, and release notes must be in **English**.

## 1. Workflow

Execute the following steps in order:

1.  **Run CI**:
    - Run `make ci` and ensure all checks pass before starting the release process.
    - If errors occur, fix them or report to the user before proceeding.
2.  **Determine Version**:
    - Check if the user has specified a new version.
    - If not, display the current version from `package.json` and ask the user for the next version.
3.  **Update package.json**:
    - Update the `version` field in `package.json` to the new version.
4.  **Commit Changes**:
    - Run `git add package.json` and commit with the message: `chore: bump version to v<version>`.
5.  **Push and Tag**:
    - Run `git push`.
    - Create a tag: `git tag v<version>`.
    - Push the tag: `git push origin v<version>`.
6.  **Analyze Diffs and Summarize**:
    - Retrieve the changes since the last tag.
      - Example: `git log $(git describe --tags --abbrev=0 HEAD^)..HEAD --oneline`
    - Analyze the commit logs and summarize the changes.
    - **Categorization & Format**:
      - Use the following sections:
        - `### 🚀 New Features`: Main feature additions.
        - `### 🛠 Improvements & Bug Fixes`: Minor changes, refactorings, and bug fixes.
      - Each item should be a concise bullet point.
    - **Multi-language Support**:
      - Generate the release notes in **both English and Japanese**.
      - The English version serves as the primary content.
      - The Japanese version must be enclosed in a `<details>` tag for folding.
      - **Label for folding**: `Japanese version is available here` (must be in English).
      - **Content Consistency**: The list items and categories must match exactly between the English and Japanese versions.
    - **Rules**:
      - Focus on **New Features**.
      - Use appropriate emojis for each section as shown above.
      - If there are too many minor fixes, do not list them all; provide a high-level summary instead.
      - Limit the total list to a maximum of 10-15 items.
7.  **Create GitHub Release**:
    - Use the GitHub CLI (`gh`) to create a release.
    - The `--notes` should contain the categorized markdown summary (including the folded Japanese version).
    - Example: `gh release create v<version> --title "v<version>" --notes-file release_notes.md` (or pass the string via `--notes`)

## 2. Precautions

- Tag names must follow the `vX.X.X` format (with a leading `v`).
- The GitHub CLI (`gh`) is required. If it's not installed, report this to the user.
- After completion, report the release URL and other relevant information to the user.
