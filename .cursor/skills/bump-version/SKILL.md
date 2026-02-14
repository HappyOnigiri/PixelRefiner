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

1.  **Determine Version**:
    - Check if the user has specified a new version.
    - If not, display the current version from `package.json` and ask the user for the next version.
2.  **Update package.json**:
    - Update the `version` field in `package.json` to the new version.
3.  **Run CI**:
    - Run `make ci` and ensure all checks pass.
    - If errors occur, fix them before proceeding.
4.  **Commit Changes**:
    - Run `git add package.json` and commit with the message: `chore: bump version to v<version>`.
5.  **Push and Tag**:
    - Run `git push`.
    - Create a tag: `git tag v<version>`.
    - Push the tag: `git push origin v<version>`.
6.  **Analyze Diffs and Summarize**:
    - Retrieve the changes since the last tag.
      - Example: `git log $(git describe --tags --abbrev=0 HEAD^)..HEAD --oneline`
    - Analyze the commit logs and summarize the changes in a bulleted list in **English**.
    - **Rules**:
      - Limit the list to a maximum of 10 items.
      - Keep each item concise; detailed descriptions are not required.
      - Consolidate duplicate or overly detailed entries as appropriate.
7.  **Create GitHub Release**:
    - Use the GitHub CLI (`gh`) to create a release.
    - Example: `gh release create v<version> --title "v<version>" --notes "<Summarized bullet points in English>"`

## 2. Precautions

- Tag names must follow the `vX.X.X` format (with a leading `v`).
- The GitHub CLI (`gh`) is required. If it's not installed, report this to the user.
- After completion, report the release URL and other relevant information to the user.
