.PHONY: ci fix build quality report ts-check-diff ts-fix-diff html-check-diff html-fix-diff repomix test test-unit test-debug type-check check-ts-rules check-ts-line-length check-file-line-count check-file-line-count-all setup

# repomix を実行してファイルを tmp/repomix/ にまとめる
repomix:
	mkdir -p tmp/repomix
	# 完全版
	pnpm exec repomix --output tmp/repomix/repomix-full.txt
	# ロックファイル、画像、ライセンスなどを除く版
	pnpm exec repomix --ignore "**/pnpm-lock.yaml,**/node_modules/**,**/*.png,**/*.jpg,**/*.jpeg,**/*.gif,**/*.svg,**/*.ico,LICENSE,**/.cursor/**" --output tmp/repomix/repomix-lite.txt
	# さらにテストファイルを除く版
	pnpm exec repomix --ignore "**/pnpm-lock.yaml,**/node_modules/**,**/*.png,**/*.jpg,**/*.jpeg,**/*.gif,**/*.svg,**/*.ico,LICENSE,**/.cursor/**,**/*.test.ts,**/test/**,public/robots.txt,public/sitemap.xml,public/site.webmanifest,.gitignore,scripts/check_ts_rules.py,Makefile,vitest.config.ts,README.ja.md" --output tmp/repomix/repomix-lite-no-tests.txt

# 通常 CI のエントリーポイント（ローカルおよび GitHub Actions）
# [Policy] 検証中に追跡ファイルを書き換えない。修正は fix ターゲットで明示的に行う。
# [Policy] 重い画像品質ケースは quality ターゲットと Quality Report workflow が担う。
# 注: このターゲットを変更する場合は .github/workflows/ci.yml も確認する
ci:
	python3 scripts/run_ci.py

fix:
	$(MAKE) ts-fix-diff
	$(MAKE) html-fix-diff

build:
	pnpm run build

quality:
	pnpm run test:quality:full

# 比較レポートの生成だけを行い、通常 CI や品質ゲートは実行しない。
report:
	pnpm run test:quality:report

test:
	pnpm run test

test-unit:
	pnpm run test:unit

test-debug:
	rm -rf tmp/debug
	PIXELATE_DEBUG_IMAGES=1 pnpm run test

type-check:
	pnpm exec tsc --noEmit

check-ts-rules:
	python3 scripts/check_ts_rules.py

check-ts-line-length:
	python3 scripts/check_ts_line_length.py

check-file-line-count:
	python3 scripts/check_file_line_count.py

check-file-line-count-all:
	python3 scripts/check_file_line_count.py --all-warnings

ts-check-diff:
	@files="$$( ( \
		git diff --name-only --diff-filter=ACMRTUXB HEAD -- '*.ts' '*.tsx' 2>/dev/null; \
		git diff --cached --name-only --diff-filter=ACMRTUXB HEAD -- '*.ts' '*.tsx' 2>/dev/null; \
		git ls-files --others --exclude-standard -- '*.ts' '*.tsx' 2>/dev/null \
	) | sort -u )"; \
	if [ -z "$$files" ]; then \
		echo "No changed TS/TSX files."; \
		exit 0; \
	fi; \
	echo "$$files" | sed 's/^/ - /'; \
	pnpm exec biome check $$files

# 変更された TS/TSX ファイルに安全な Biome 修正（整形、import の整理など）を適用する
ts-fix-diff:
	@files="$$( ( \
		git diff --name-only --diff-filter=ACMRTUXB HEAD -- '*.ts' '*.tsx' 2>/dev/null; \
		git diff --cached --name-only --diff-filter=ACMRTUXB HEAD -- '*.ts' '*.tsx' 2>/dev/null; \
		git ls-files --others --exclude-standard -- '*.ts' '*.tsx' 2>/dev/null \
	) | sort -u )"; \
	if [ -z "$$files" ]; then \
		echo "No changed TS/TSX files."; \
		exit 0; \
	fi; \
	echo "$$files" | sed 's/^/ - /'; \
	pnpm exec biome check --write $$files

html-check-diff:
	@files="$$( ( \
		git diff --name-only --diff-filter=ACMRTUXB HEAD -- '*.html' 2>/dev/null; \
		git diff --cached --name-only --diff-filter=ACMRTUXB HEAD -- '*.html' 2>/dev/null; \
		git ls-files --others --exclude-standard -- '*.html' 2>/dev/null \
	) | sort -u )"; \
	if [ -z "$$files" ]; then \
		echo "No changed HTML files."; \
		exit 0; \
	fi; \
	echo "$$files" | sed 's/^/ - /'; \
	pnpm exec prettier --check $$files

html-fix-diff:
	@files="$$( ( \
		git diff --name-only --diff-filter=ACMRTUXB HEAD -- '*.html' 2>/dev/null; \
		git diff --cached --name-only --diff-filter=ACMRTUXB HEAD -- '*.html' 2>/dev/null; \
		git ls-files --others --exclude-standard -- '*.html' 2>/dev/null \
	) | sort -u )"; \
	if [ -z "$$files" ]; then \
		echo "No changed HTML files."; \
		exit 0; \
	fi; \
	echo "$$files" | sed 's/^/ - /'; \
	pnpm exec prettier --write $$files

setup:
	corepack enable
	COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare pnpm --activate
	COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile
