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

|Case|Target quality|Change from base branch|Output|Classification confidence|Grid confidence|Candidate modal (expected)|WARNING presentation|Decision reason|WARNING codes|Target mean RGBA error|Target Edge F1|Runtime (ms)|
|---|---|---|---:|---:|---|---|---|---|---|---:|---:|---:|
|remove-background-trim-auto-grid|met|unchanged|22x22|0.9037|0.6061|would-not-show|none|NO_WARNING|-|0|1|1669.77|
|remove-background-trim-resize-46x13|met|unchanged|46x13|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|60.60|
|trim-auto-grid|met|unchanged|88x61|0.7725|0.4907|would-not-show|none|NO_WARNING|-|0|1|17408.20|
|remove-inner-background-auto-grid|met|unchanged|22x21|0.8198|0.5278|would-not-show|none|NO_WARNING|-|0|1|8083.97|
|remove-background-preserve-canvas|met|unchanged|120x66|0.8060|0.5193|would-not-show|indicator|NO_LOW_GRID_CONFIDENCE|CONTENT_LOSS_RISK|0|1|12032.89|
|convert-deterministic-auto-palette|met|unchanged|32x32|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|26.47|
|convert-game-boy-pocket-palette|met|unchanged|512x512|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|295.99|
|convert-monochrome-floyd-steinberg|met|unchanged|330x325|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|250.95|
|remove-background-auto-grid-keep-aspect|met|unchanged|108x61|0.7725|0.4907|would-not-show|none|NO_WARNING|-|0|1|18900.13|
|pad-wide-image-to-square|met|unchanged|10x10|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|1.85|
|pad-tall-image-to-square|met|unchanged|10x10|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.32|
|restore-high-resolution-pixel-grid|met|unchanged|140x212|0.6913|0.4695|would-not-show|none|NO_WARNING|-|0|1|16194.30|
|preserve-native-pixel-art|met|unchanged|8x8|0.8500|0.0000|would-not-show|none|NO_WARNING|-|0|1|5.50|
|restore-nearest-2x-to-8x8|met|unchanged|8x8|0.6667|0.7146|would-not-show|none|NO_WARNING|-|0|1|40.49|
|restore-nearest-3x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|2.04|
|restore-nearest-4x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.61|
|restore-nearest-8x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.59|
|restore-nearest-16x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.92|
|restore-nearest-32x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|2.54|
|restore-nearest-1-5x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.34|
|restore-nearest-2-5x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.79|
|restore-nearest-3-2x-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.37|
|restore-bilinear-to-8x8|met|unchanged|8x8|0.7018|0.4475|would-not-show|none|NO_WARNING|-|4.449|1|97.00|
|restore-bicubic-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|10.734|1|0.67|
|restore-gaussian-blur-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|7.734|1|1.14|
|restore-rgb-noise-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|1.414|1|0.47|
|restore-alpha-edge-blur-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.88|
|restore-crop-shifts-to-8x8|unmet|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|34.484|0.529|0.70|
|remove-white-padding-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|1.59|
|remove-black-padding-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.57|
|remove-solid-padding-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|1.00|
|remove-gradient-padding-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|4.59|
|restore-anisotropic-scale-to-8x8|met|unchanged|8x8|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|0.18|
|discover-anisotropic-noninteger-grid|met|unchanged|8x8|0.7927|0.5775|would-not-show|none|NO_WARNING|-|0|1|30.31|
|restore-transparent-rgb-padding-to-8x8|met|unchanged|8x8|0.6667|0.4587|would-not-show|none|NO_WARNING|-|0|1|17.72|
|withhold-ambiguous-axis-grid|met|unchanged|8x8|-|0.0000|not-applicable|indicator|NOT_AUTO|ONE_AXIS_DETECTION_FAILED, LOW_GRID_CONFIDENCE|0|1|2.40|
|show-ui-default-candidates|met|unchanged|2x2|0.7133|0.3241|would-show|candidate-list|LOW_GRID_CONFIDENCE|LOW_GRID_CONFIDENCE, EXTREME_OUTPUT_SIZE|0|1|167.42|
|restore-soft-edged-sprite-to-34x47|met|unchanged|34x47|-|1.0000|not-applicable|none|NOT_AUTO|-|0|1|1007.00|
|restore-blocky-sprite-to-20x18|met|unchanged|20x18|-|1.0000|not-applicable|none|NOT_AUTO|-|0|1|1195.45|
|restore-alpha-only-grid-to-8x8|met|unchanged|8x8|0.7645|0.6213|would-not-show|none|NO_WARNING|-|0|1|67.04|
|restore-diagonal-grid-to-8x8|met|unchanged|8x8|0.5694|0.4401|would-not-show|none|NO_WARNING|-|8.688|1|80.63|
|prefer-base-grid-over-doubled-period|met|unchanged|8x8|0.7939|0.6661|would-not-show|none|NO_WARNING|-|0|1|82.20|
|restore-thin-features-and-alpha-coverage|met|unchanged|6x6|-|1.0000|would-not-show|none|NO_WARNING|-|0|1|6.26|
|convert-continuous-tone-balanced|met|unchanged|24x16|0.7032|1.0000|would-not-show|none|NO_WARNING|-|0|1|143.23|
|convert-illustration-detailed|met|unchanged|54x36|-|1.0000|not-applicable|none|NOT_AUTO|-|0|1|38.67|
|remove-gradient-background-with-border-model|met|unchanged|24x24|-|1.0000|would-not-show|indicator|NO_LOW_GRID_CONFIDENCE|CONTENT_LOSS_RISK|0|1|6.15|
|share-balanced-palette-across-batch|met|unchanged|16x16|-|1.0000|not-applicable|none|NOT_AUTO|-|0|1|10.13|
|retain-protected-small-details|met|unchanged|16x16|-|1.0000|not-applicable|indicator|NOT_AUTO|CONTENT_LOSS_RISK|0|1|1.36|
|remove-isolated-small-noise|met|unchanged|16x16|-|1.0000|not-applicable|indicator|NOT_AUTO|CONTENT_LOSS_RISK|0|1|0.65|
|skip-small-removal-on-uncertain-background|met|unchanged|20x20|-|1.0000|not-applicable|indicator|NOT_AUTO|BACKGROUND_UNCERTAIN|0|1|1.42|
|guide-recipe1-knight-sprite|met|unchanged|60x85|0.7039|0.5468|would-not-show|none|NO_WARNING|-|0|1|18237.82|
|guide-recipe2-potion-icon|met|unchanged|16x23|0.8453|0.5570|would-not-show|none|NO_WARNING|-|0|1|22071.97|
|guide-recipe3-dragon-sprite|met|unchanged|44x47|0.8100|0.5362|would-not-show|none|NO_WARNING|-|0|1|32430.48|
|guide-recipe4-landscape|met|unchanged|256x144|0.8151|0.5272|would-not-show|none|NO_WARNING|-|0|1|17197.31|
|guide-recipe5-chibi-character|met|unchanged|60x81|-|1.0000|not-applicable|none|NOT_AUTO|-|0|1|2921.63|
|auto-auto-grid-detection|met|unchanged|88x61|0.7788|0.4961|would-not-show|none|NO_WARNING|-|0|1|19070.28|
|auto-high-resolution|met|unchanged|140x212|0.6933|0.4691|would-not-show|none|NO_WARNING|-|0|1|17978.22|
|auto-inner-background-removal|met|unchanged|22x21|0.8317|0.5334|would-show|candidate-list|LOW_GRID_CONFIDENCE|LOW_GRID_CONFIDENCE|0|1|11203.66|
|auto-no-trimming|met|unchanged|24x33|0.8260|0.5285|would-not-show|none|NO_WARNING|-|0|1|14397.03|
|auto-quality-prf400-ambiguous-grid-scale|met|unchanged|20x18|0.7627|0.5819|would-not-show|none|NO_WARNING|-|0|1|15845.99|
|auto-quality-prf400-soft-edged-sprite|unmet|unchanged|33x47|0.6864|0.5027|would-show|candidate-list|LOW_GRID_CONFIDENCE|LOW_GRID_CONFIDENCE|12.676|0|20392.22|
|auto-resize-and-remove-bg|met|unchanged|22x22|0.9037|0.6268|would-not-show|none|NO_WARNING|-|0|1|6096.86|
|auto-resize-with-trimming|met|unchanged|46x13|0.7294|0.4538|would-not-show|none|NO_WARNING|-|0|1|2012.77|
