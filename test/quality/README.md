# Quality benchmark

The quality benchmark uses [`cases.json`](./cases.json) as the single registry
for image-based processing tests and the comparison report. It runs entirely
from checked-in fixtures and does not use network access or image-generation
APIs.

## Commands

```sh
pnpm test:quality          # lightweight smoke profile for local checks
pnpm test:quality:full     # all cases used by the pull-request quality gate
make report                # only generate tmp/quality-report/latest
pnpm test:quality:update   # intentionally replace the stored baseline
```

## Parallel execution

Vitest parallelizes per test file, so the cases are split across the shard files
in [`shards/`](./shards). Each file calls `runCasesShard` from
[`shard.ts`](./shard.ts), which distributes the selected cases over
`QUALITY_SHARD_COUNT` groups by input pixel count, largest first, so the slowest
case never shares a shard with another heavy one. `cases.test.ts` fails if the
number of shard files stops matching `QUALITY_SHARD_COUNT` or if the split no
longer covers every selected case exactly once.

`make report` therefore runs Vitest twice. The first run executes
the shards, writes the per-case images under `tmp/quality-report/latest`, and
stores each shard's case results in `tmp/quality-report/partial`. The second run
executes [`report.test.ts`](./report.test.ts), which merges the partial results
back into manifest order and writes `results.json`, `summary.md`, and the HTML
report. Because ordering is restored from the manifest, the report is identical
to a serial run apart from the measured runtime and memory values.

The pull-request quality workflow enables report and gate modes together. Each
case is processed once, and that single result is used for both the report and
the regression assertions. `make report` deliberately leaves gate mode disabled
so local report generation performs only the work needed for its artifacts.

`pnpm test:quality:update` also runs Vitest twice. The first run
(`quality:update:generate`) executes the shards with
`UPDATE_QUALITY_BASELINE=1`: each case is measured against the still-unchanged
baseline images (read-only, so parallel shards cannot race each other) and the
resulting metrics and output image are written to
`tmp/quality-baseline-update`. The second run (`quality:update:apply`)
executes `cases.test.ts`, which merges the staged results back into manifest
order and performs the only write to `test/quality/baseline.json` and
`test/quality/baseline/`. Splitting the write from the measurement keeps the
"measure against the old baseline, then replace it" requirement intact while
letting the measurement itself run in parallel.

Open `tmp/quality-report/latest/index.html` directly in a browser after
generating a report. The report includes JSON and Markdown summaries plus, for
every selected case, the input, the target, the previous run, the current run,
the difference from the target, the difference from the previous run, and the
background mask. See [Target images](#target-images) for how the target and the
previous run differ.

The HTML report initially shows every case. Its primary quality status answers
whether the current image meets the fixed target and that target's allowances.
Auto cases inherit the allowances from the explicit case that supplied their
target. A separate previous-run status shows whether the output changed, stayed
unchanged, or is a new case. Use both filters together to list, for example,
all target-unmet cases whose output changed. Cases without a target are
reported as unassessable rather than passed.

## Publishing

Two workflows publish the HTML report to GitHub Pages. Pull requests publish to
`quality/pr-<number>/` while they are open, and every push to `main` publishes to
the fixed `quality/latest/` path that the README and the app footer link to.

The `main` report takes its previous run from the release tag chosen by
[`select_previous_release_tag.py`](../../scripts/select_previous_release_tag.py):
the last patch of the minor version before the newest tag, so `v1.2.0` compares
against `v1.1.2`. The newest tag itself is skipped because `main` normally points
at that release already, which would leave nothing to compare.

When that baseline cannot be fetched — a repository with a single release series,
or a local run without `test/quality/baseline` — the report omits every
previous-run comparison instead of falling back to the checked-in baseline: the
change filter, the change badges, the baseline and delta columns, and the changed
pixel counts all disappear, and the sidebar records why. The target comparison is
unaffected because it never depends on a previous run.

## Adding a fixture

1. Add or deterministically generate the PNG under `test/fixtures/`. Prefer code generation in [`generate-fixtures.test.ts`](./generate-fixtures.test.ts).
2. Add one case to [`cases.json`](./cases.json). Record a unique case and feature
   ID, all processing options, assertions, profile, input kind, degradation
   pattern, and provenance for every referenced asset.
   A matching auto case appears automatically, so register its target in
   [`auto-targets.json`](./auto-targets.json) and run
   `pnpm run quality:targets:init`. If the fixture requires dedicated options or
   multiple images and should not be evaluated as a single-image Auto case,
   register the reason in
   [`auto-case-exclusions.json`](./auto-case-exclusions.json) instead.
3. Add or update the case text in `describeCase` in
   [`benchmark.ts`](./benchmark.ts). The description must make the test intent
   understandable on its own: identify the relevant input characteristics, the
   processing under test, and exactly what the output must preserve. Do not use
   vague phrases such as "preserve the image."
4. Run `pnpm test:quality:full` and `make report`.
5. Inspect the report visually. If the current baseline should intentionally change, run `pnpm test:quality:update` and review both `baseline.json` and the PNG files under `test/quality/baseline/`.

Manifest validation fails for duplicate case IDs, missing required degradation
patterns, missing provenance, fixture files that no case references, or assets
whose terms do not permit modification and redistribution. The same manifest is
parameterized by the quality test and rendered in full by the HTML report. Auto
case exclusions therefore happen while building the manifest rather than only
hiding report entries; their explicit cases remain in the report.

## Target images

Two separate references exist for every case, and they answer different
questions.

| Reference | Question                                       | Changes                          |
| --------- | ---------------------------------------------- | -------------------------------- |
| Target    | How far is the output from where it should be? | Only by deliberate review        |
| Baseline  | What changed since the base branch?            | Whenever a PR changes the output |

For cases with explicit options the target is the `expected` image already
registered in `cases.json`. Auto cases have no ground truth of their own, so
their initial target is the approved baseline of the explicit case that processes
the same fixture, copied once into [`targets/`](./targets) and pinned there. When
a review finds the auto output itself good enough — usually because the explicit
options cannot produce what the auto route should aim for — that output replaces
the target and the `note` records the decision, while `source` stays as the
origin of the inherited allowances. The mapping and the reason for each
hand-picked entry live in [`auto-targets.json`](./auto-targets.json); auto cases
that cannot have a target are listed under `excluded` with the reason.

```sh
pnpm run quality:targets:init   # copy target images for newly registered cases
```

That command only creates missing files. It never overwrites an existing target,
and `pnpm test:quality:update` does not touch `targets/` at all, because a target
that drifts toward the current output stops being a target. Replacing one is a
deliberate edit that should be reviewed on its own.

`targets.test.ts` fails when an auto case has neither a target nor a recorded
exclusion reason, when a mapping points at a case that does not exist, or when
`targets/` holds an image no case references. Adding a fixture therefore forces a
decision about its target instead of silently producing a case without one.

Target quality is the report's primary verdict but does not fail the regression
gate. Several auto cases are known to fall short of their target, so using that
verdict as the CI gate would leave the gate permanently red. The gate therefore
continues to compare against the previous-run baseline, while the report labels
the two concepts separately. Note that edge F1, background-mask IoU, and
small-component retention read `0` whenever the sizes differ; the size-matches
row above them says why.

## Metrics and baseline

The stored baseline records approved result images as well as mean RGBA error,
edge F1, background-mask IoU, small-component retention, and
catastrophic-failure status. On pull requests, CI reads these files from the PR
base commit, so updating baseline files in the head commit cannot hide a change.
Each run additionally reports Top-1 and Top-3 output-size accuracy, grid phase
error, byte determinism, runtime, and an image-buffer memory approximation.

A catastrophic failure means a 1-pixel dimension, an unreasonable output area,
or removal of more than 80% of expected opaque pixels. Baseline updates are
explicit; regular test and report commands never rewrite checked-in
expectations.

Deterministic, reversible transformations such as integer nearest-neighbor
restoration require an exact RGBA match with the ground truth. Lossy
transformations use fixed limits for mean RGBA error, edge F1, background-mask
IoU, and small-component retention. Comparisons with the PR base allow only a
`0.000001` serialization tolerance, so accepted quality improvements become the
minimum for subsequent changes instead of permitting gradual regression.
