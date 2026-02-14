.PHONY: ci ci-check ts-check-diff ts-fix-diff html-check-diff html-fix-diff watch-dev repomix test test-debug

# コードの変更を検知して再ビルドを実行
watch-dev:
	npm run build -- --watch

# repomixを実行してファイルをまとめ、tmp/repomix/ フォルダに出力
repomix:
	mkdir -p tmp/repomix
	npx repomix --output tmp/repomix/repomix-output.txt

# ローカル実行向け: 可能な範囲で自動整形 → チェック → テスト
ci:
	$(MAKE) ts-fix-diff
	$(MAKE) html-fix-diff
	$(MAKE) ts-check-diff
	$(MAKE) html-check-diff
	$(MAKE) type-check
	$(MAKE) test

# CI（サーバ）向け: 自動修正せず、差分があれば失敗
ci-check:
	$(MAKE) ts-check-diff
	$(MAKE) html-check-diff
	$(MAKE) type-check
	$(MAKE) test

test:
	npm run test

test-debug:
	rm -rf tmp/debug
	PIXELATE_DEBUG_IMAGES=1 npm run test

type-check:
	npx tsc --noEmit

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

# 変更のあるTS/TSXに対して、Biomeの安全な修正（format/organizeImports等）を適用する
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
