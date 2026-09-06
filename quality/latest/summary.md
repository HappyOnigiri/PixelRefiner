# PixelRefiner quality report

- Cases: 63
- Target met: 61
- Target unmet: 2
- Cannot assess: 0
- Changed: 0
- Unchanged: 63
- New: 0
- Top-1 size accuracy: 100.0%
- Top-3 size accuracy: 100.0%
- Confidence/correctness correlation: 0.600
- Catastrophic failure rate: 0.0%

|Case|Target quality|Change from previous run|Output|Classification confidence|Grid confidence|Candidate modal (expected)|WARNING presentation|Decision reason|WARNING codes|Target mean RGBA error|Target Edge F1|Runtime (ms)|
|---|---|---|---:|---:|---|---|---|---|---|---:|---:|---:|
|remove-background-trim-auto-grid|met|unchanged|22x22|0.9037|0.6061|would-not-show|none|NO_WARNING|-|0|1|1320.46|
|remove-background-trim-resize-46x13|met|unchanged|46x13|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|55.84|
|trim-auto-grid|met|unchanged|88x61|0.7725|0.4907|would-not-show|none|NO_WARNING|-|0|1|18054.30|
|remove-inner-background-auto-grid|met|unchanged|22x21|0.8198|0.5278|would-not-show|none|NO_WARNING|-|0|1|8322.31|
|remove-background-preserve-canvas|met|unchanged|120x66|0.8060|0.5193|would-not-show|indicator|NO_LOW_GRID_CONFIDENCE|CONTENT_LOSS_RISK|0|1|12233.90|
|convert-deterministic-auto-palette|met|unchanged|32x32|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|29.28|
|convert-game-boy-pocket-palette|met|unchanged|512x512|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|272.35|
|convert-monochrome-floyd-steinberg|met|unchanged|330x325|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|171.34|
|remove-background-auto-grid-keep-aspect|met|unchanged|108x61|0.7725|0.4907|would-not-show|none|NO_WARNING|-|0|1|19624.15|
|pad-wide-image-to-square|met|unchanged|10x10|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|1.53|
|pad-tall-image-to-square|met|unchanged|10x10|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.20|
|restore-high-resolution-pixel-grid|met|unchanged|140x212|0.6913|0.4695|would-not-show|none|NO_WARNING|-|0|1|16722.63|
|preserve-native-pixel-art|met|unchanged|8x8|0.8500|0.0000|would-not-show|none|NO_WARNING|-|0|1|4.62|
|restore-nearest-2x-to-8x8|met|unchanged|8x8|0.6667|0.7146|would-not-show|none|NO_WARNING|-|0|1|20.63|
|restore-nearest-3x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.67|
|restore-nearest-4x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.67|
|restore-nearest-8x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.59|
|restore-nearest-16x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|1.00|
|restore-nearest-32x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|1.66|
|restore-nearest-1-5x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.21|
|restore-nearest-2-5x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.70|
|restore-nearest-3-2x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.25|
|restore-bilinear-to-8x8|met|unchanged|8x8|0.7018|0.4475|would-not-show|none|NO_WARNING|-|4.449|1|76.33|
|restore-bicubic-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|10.734|1|0.63|
|restore-gaussian-blur-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|7.734|1|1.14|
|restore-rgb-noise-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|1.414|1|0.39|
|restore-alpha-edge-blur-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.80|
|restore-crop-shifts-to-8x8|unmet|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|34.484|0.529|0.66|
|remove-white-padding-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|1.79|
|remove-black-padding-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.99|
|remove-solid-padding-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.99|
|remove-gradient-padding-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|3.87|
|restore-anisotropic-scale-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.38|
|discover-anisotropic-noninteger-grid|met|unchanged|8x8|0.7927|0.5775|would-not-show|none|NO_WARNING|-|0|1|28.37|
|restore-transparent-rgb-padding-to-8x8|met|unchanged|8x8|0.6667|0.4587|would-not-show|none|NO_WARNING|-|0|1|15.78|
|withhold-ambiguous-axis-grid|met|unchanged|8x8|-|0.0000|not-applicable|indicator|NOT_AUTO|ONE_AXIS_DETECTION_FAILED, LOW_GRID_CONFIDENCE|0|1|2.66|
|show-ui-default-candidates|met|unchanged|2x2|0.7133|0.3241|would-show|candidate-list|LOW_GRID_CONFIDENCE|LOW_GRID_CONFIDENCE, EXTREME_OUTPUT_SIZE|0|1|155.99|
|restore-soft-edged-sprite-to-34x47|met|unchanged|34x47|-|1.0000|not-applicable|none|NOT_AUTO|-|0|1|1253.04|
|restore-blocky-sprite-to-20x18|met|unchanged|20x18|-|1.0000|not-applicable|none|NOT_AUTO|-|0|1|1342.77|
|restore-alpha-only-grid-to-8x8|met|unchanged|8x8|0.7645|0.6213|would-not-show|none|NO_WARNING|-|0|1|49.30|
|restore-diagonal-grid-to-8x8|met|unchanged|8x8|0.5694|0.4401|would-not-show|none|NO_WARNING|-|8.688|1|61.85|
|prefer-base-grid-over-doubled-period|met|unchanged|8x8|0.7939|0.6661|would-not-show|none|NO_WARNING|-|0|1|61.23|
|restore-thin-features-and-alpha-coverage|met|unchanged|6x6|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|4.31|
|convert-continuous-tone-balanced|met|unchanged|24x16|0.7032|1.0000|would-not-show|none|NO_WARNING|-|0|1|131.97|
|convert-illustration-detailed|met|unchanged|54x36|-|1.0000|not-applicable|none|NOT_AUTO|-|0|1|46.52|
|remove-gradient-background-with-border-model|met|unchanged|24x24|-|1.0000|would-not-show|indicator|NO_LOW_GRID_CONFIDENCE|CONTENT_LOSS_RISK|0|1|5.20|
|share-balanced-palette-across-batch|met|unchanged|16x16|-|1.0000|not-applicable|none|NOT_AUTO|-|0|1|13.55|
|retain-protected-small-details|met|unchanged|16x16|-|1.0000|not-applicable|indicator|NOT_AUTO|CONTENT_LOSS_RISK|0|1|1.08|
|remove-isolated-small-noise|met|unchanged|16x16|-|1.0000|not-applicable|indicator|NOT_AUTO|CONTENT_LOSS_RISK|0|1|0.53|
|skip-small-removal-on-uncertain-background|met|unchanged|20x20|-|1.0000|not-applicable|indicator|NOT_AUTO|BACKGROUND_UNCERTAIN|0|1|2.39|
|guide-recipe1-knight-sprite|met|unchanged|60x85|0.7039|0.5468|would-not-show|none|NO_WARNING|-|0|1|16435.84|
|guide-recipe2-potion-icon|met|unchanged|16x23|0.8453|0.5570|would-not-show|none|NO_WARNING|-|0|1|21586.82|
|guide-recipe3-dragon-sprite|met|unchanged|44x47|0.8100|0.5362|would-not-show|none|NO_WARNING|-|0|1|30189.53|
|guide-recipe4-landscape|met|unchanged|256x144|0.8151|0.5272|would-not-show|none|NO_WARNING|-|0|1|19386.70|
|guide-recipe5-chibi-character|met|unchanged|60x81|-|1.0000|not-applicable|none|NOT_AUTO|-|0|1|2250.03|
|auto-auto-grid-detection|met|unchanged|88x61|0.7788|0.4961|would-not-show|none|NO_WARNING|-|0|1|19347.45|
|auto-high-resolution|met|unchanged|140x212|0.6933|0.4691|would-not-show|none|NO_WARNING|-|0|1|16978.72|
|auto-inner-background-removal|met|unchanged|22x21|0.8317|0.5334|would-show|candidate-list|LOW_GRID_CONFIDENCE|LOW_GRID_CONFIDENCE|0|1|12131.28|
|auto-no-trimming|met|unchanged|24x33|0.8260|0.5285|would-not-show|none|NO_WARNING|-|0|1|13418.47|
|auto-quality-prf400-ambiguous-grid-scale|met|unchanged|20x18|0.7627|0.5819|would-not-show|none|NO_WARNING|-|0|1|16632.25|
|auto-quality-prf400-soft-edged-sprite|unmet|unchanged|33x47|0.6864|0.5027|would-show|candidate-list|LOW_GRID_CONFIDENCE|LOW_GRID_CONFIDENCE|12.676|0|20837.13|
|auto-resize-and-remove-bg|met|unchanged|22x22|0.9037|0.6268|would-not-show|none|NO_WARNING|-|0|1|5990.41|
|auto-resize-with-trimming|met|unchanged|46x13|0.7294|0.4538|would-not-show|none|NO_WARNING|-|0|1|2021.08|
