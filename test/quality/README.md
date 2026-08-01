# Quality benchmark

The quality benchmark uses [`cases.json`](./cases.json) as the single registry
for image-based processing tests and the comparison report. It runs entirely
from checked-in fixtures and does not use network access or image-generation
APIs.

## Commands

```sh
pnpm test:quality          # lightweight smoke profile used by CI
pnpm test:quality:full     # all cases for local evaluation
pnpm test:quality:report   # write tmp/quality-report/latest
pnpm test:quality:update   # intentionally replace the stored baseline
```

Open `tmp/quality-report/latest/index.html` directly in a browser after
generating a report. The report includes JSON and Markdown summaries plus
ground truth, input, approved baseline, current, ground-truth difference,
baseline difference, and background-mask images for every selected case.

The HTML report initially shows every case. Use the change-status, quality-status,
and text filters to narrow the list to review targets. A difference is not
automatically a regression: metric changes classify it as improved, regressed,
or changed without a measurable quality change. Known expectation failures that
are unchanged remain visible through the status filter but do not fail the
regression gate.

## Adding a fixture

1. Add or deterministically generate the PNG under `test/fixtures/`. Prefer code generation in [`generate-fixtures.test.ts`](./generate-fixtures.test.ts).
2. Add one case to [`cases.json`](./cases.json). Record a unique case and feature
   ID, all processing options, assertions, profile, input kind, degradation
   pattern, and provenance for every referenced asset.
3. Run `pnpm test:quality:full` and `pnpm test:quality:report`.
4. Inspect the report visually. If the current baseline should intentionally change, run `pnpm test:quality:update` and review both `baseline.json` and the PNG files under `test/quality/baseline/`.

Manifest validation fails for duplicate case IDs, missing required degradation
patterns, missing provenance, fixture files that no case references, or assets
whose terms do not permit modification and redistribution. The same manifest is
parameterized by the quality test and rendered in full by the HTML report, so a
case cannot be excluded only from the report.

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
