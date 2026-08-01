.PHONY: ci ts-check-diff ts-fix-diff html-check-diff html-fix-diff repomix test test-debug type-check check-ts-rules check-ts-line-length setup

# Run repomix to bundle files into tmp/repomix/ folder
repomix:
	mkdir -p tmp/repomix
	# Full version
	pnpm dlx repomix --output tmp/repomix/repomix-full.txt
	# Version excluding lockfiles, images, licenses, etc.
	pnpm dlx repomix --ignore "**/pnpm-lock.yaml,**/node_modules/**,**/*.png,**/*.jpg,**/*.jpeg,**/*.gif,**/*.svg,**/*.ico,LICENSE,**/.cursor/**" --output tmp/repomix/repomix-lite.txt
	# Version further excluding test files
	pnpm dlx repomix --ignore "**/pnpm-lock.yaml,**/node_modules/**,**/*.png,**/*.jpg,**/*.jpeg,**/*.gif,**/*.svg,**/*.ico,LICENSE,**/.cursor/**,**/*.test.ts,**/test/**,public/robots.txt,public/sitemap.xml,public/site.webmanifest,.gitignore,scripts/check_ts_rules.py,Makefile,vitest.config.ts,README.ja.md" --output tmp/repomix/repomix-lite-no-tests.txt

# CI entrypoint (local and GitHub Actions)
# Strategy: run auto-fix, then GitHub Actions detects diffs via git diff --exit-code
# NOTE: if you change this target, also check .github/workflows/ci.yml
ci:
	python3 scripts/run_ci.py

test:
	pnpm run test

test-debug:
	rm -rf tmp/debug
	PIXELATE_DEBUG_IMAGES=1 pnpm run test

type-check:
	pnpm exec tsc --noEmit

check-ts-rules:
	python3 scripts/check_ts_rules.py

check-ts-line-length:
	python3 scripts/check_ts_line_length.py

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
	pnpm dlx @biomejs/biome@latest check $$files

# Apply safe Biome fixes (format, organizeImports, etc.) to changed TS/TSX files
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
	pnpm dlx @biomejs/biome@latest check --write $$files

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
	pnpm dlx prettier@latest --check $$files

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
	pnpm dlx prettier@latest --write $$files

setup:
	corepack enable
	COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare pnpm --activate
	COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile
