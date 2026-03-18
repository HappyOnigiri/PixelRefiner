.PHONY: ci ts-check-diff ts-fix-diff html-check-diff html-fix-diff repomix test test-debug type-check check-ts-rules check-non-ascii sync-ruler setup

# Run repomix to bundle files into tmp/repomix/ folder
repomix:
	mkdir -p tmp/repomix
	# Full version
	npx repomix --output tmp/repomix/repomix-full.txt
	# Version excluding lockfiles, images, licenses, etc.
	npx repomix --ignore "**/package-lock.json,**/node_modules/**,**/*.png,**/*.jpg,**/*.jpeg,**/*.gif,**/*.svg,**/*.ico,LICENSE,**/.cursor/**" --output tmp/repomix/repomix-lite.txt
	# Version further excluding test files
	npx repomix --ignore "**/package-lock.json,**/node_modules/**,**/*.png,**/*.jpg,**/*.jpeg,**/*.gif,**/*.svg,**/*.ico,LICENSE,**/.cursor/**,**/*.test.ts,**/test/**,public/robots.txt,public/sitemap.xml,public/site.webmanifest,.gitignore,scripts/check_ts_rules.py,Makefile,vitest.config.ts,README.ja.md" --output tmp/repomix/repomix-lite-no-tests.txt

# CI entrypoint (local and GitHub Actions)
# Strategy: run auto-fix, then GitHub Actions detects diffs via git diff --exit-code
# NOTE: if you change this target, also check .github/workflows/ci.yml
ci:
	python3 scripts/run_ci.py

test:
	npm run test

test-debug:
	rm -rf tmp/debug
	PIXELATE_DEBUG_IMAGES=1 npm run test

type-check:
	npx tsc --noEmit

check-ts-rules:
	python3 scripts/check_ts_rules.py

check-non-ascii:
	python3 scripts/check_non_ascii.py

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
	npx --yes @biomejs/biome@latest check $$files

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
	npx --yes @biomejs/biome@latest check --write $$files

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
	npx --yes prettier@latest --check $$files

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
	npx --yes prettier@latest --write $$files

# Sync ruler configuration and regenerate AGENTS.md / CLAUDE.md
sync-ruler:
	@sh scripts/sync_rule.sh

setup:
	@if [ -e .git/hooks/post-merge ]; then echo "setup: skipping post-merge (already exists)"; else printf '#!/bin/sh\nmake sync-ruler\n' > .git/hooks/post-merge && chmod +x .git/hooks/post-merge; fi
	@if [ -e .git/hooks/post-checkout ]; then echo "setup: skipping post-checkout (already exists)"; else printf '#!/bin/sh\nmake sync-ruler\n' > .git/hooks/post-checkout && chmod +x .git/hooks/post-checkout; fi
	@echo "setup: git hooks installed"
