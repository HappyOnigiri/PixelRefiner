import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";
import { setupLanguageButtons, setupPromptCopyButtons } from "./guide-controls";
import { i18n } from "./i18n";
import { guideMessages } from "./i18n/messages/guide";
import { initTheme } from "./theme";

// [Intended] CSS は guide.html の <link> で読み込む。
// JS から import すると dev で描画後にスタイルが当たり、FOUC になる。

// [Policy] 読み物ページなので画像処理系のモジュールは読み込まない。
// [Intended] レシピ集の文言はこのページからだけ登録する。
// 本体アプリ（index.html）のバンドルに guide.* の訳文を載せないため。
i18n.registerMessages(guideMessages);

initTheme();
inject();
injectSpeedInsights();

window.addEventListener("DOMContentLoaded", () => {
	setupLanguageButtons();
	setupPromptCopyButtons();
	// [Intended] <title> にも data-i18n を付けているため、
	// updatePage() だけで document.title まで言語に追従する。
	i18n.updatePage();
});
