.PHONY: ci ci-check ts-check-diff ts-fix-diff html-check-diff html-fix-diff watch-dev repomix test test-debug check-ts-rules

# コードの変更を検知して再ビルドを実行
watch-dev:
	npm run build -- --watch

# repomixを実行してファイルをまとめ、tmp/repomix/ フォルダに出力
repomix:
	mkdir -p tmp/repomix
	# フルバージョン
	npx repomix --output tmp/repomix/repomix-full.txt
	# ロックファイル、画像、ライセンス等を除外したバージョン
	npx repomix --ignore "**/package-lock.json,**/node_modules/**,**/*.png,**/*.jpg,**/*.jpeg,**/*.gif,**/*.svg,**/*.ico,LICENSE,**/.cursor/**" --output tmp/repomix/repomix-lite.txt
	# さらにテストファイルを除外したバージョン
	npx repomix --ignore "**/package-lock.json,**/node_modules/**,**/*.png,**/*.jpg,**/*.jpeg,**/*.gif,**/*.svg,**/*.ico,LICENSE,**/.cursor/**,**/*.test.ts,**/test/**,public/robots.txt,public/sitemap.xml,public/site.webmanifest,.gitignore,scripts/check_ts_rules.py,Makefile,vitest.config.ts,README.ja.md" --output tmp/repomix/repomix-lite-no-tests.txt

# ローカル実行向け: 可能な範囲で自動整形 → チェック → テスト
ci:
	python3 scripts/run_ci.py

# CI（サーバ）向け: 自動修正せず、差分があれば失敗
ci-check:
	$(MAKE) ts-check-diff
	$(MAKE) html-check-diff
	$(MAKE) type-check
	$(MAKE) check-ts-rules
	$(MAKE) test

test:
	npm run test

test-debug:
	rm -rf tmp/debug
	PIXELATE_DEBUG_IMAGES=1 npm run test

type-check:
	npx tsc --noEmit

check-ts-rules:
	python3 scripts/check_ts_rules.py

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
