/**
 * [Policy] HTML が data-i18n / data-i18n-attr で参照している i18n キーを取り出す。
 * 翻訳キーの過不足検査（src/browser/i18n/messages.test.ts）と、ガイドのレシピと
 * 品質ケースの対応検査（test/quality/guide-cases.test.ts）が同じ抽出を使う。
 * 属性の書き方を増やしたときに片方だけ古い抽出のまま残ると、その検査が対象を
 * 取りこぼしても失敗として現れないため、実装を 1 か所にまとめている。
 */
export const collectHtmlKeys = (html: string): string[] => {
	const keys: string[] = [];
	for (const [, key] of html.matchAll(/data-i18n="([^"]+)"/g)) {
		keys.push(key);
	}
	for (const [, config] of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
		for (const pair of config.split(",")) {
			const key = pair.split(":")[1];
			if (key) keys.push(key.trim());
		}
	}
	return keys;
};
