import { attributeMessages } from "./attributes";
import { optionMessages } from "./options";
import { presetMessages } from "./presets";
import { processingMessages } from "./processing";
import { settingMessages } from "./settings";
import { tooltipMessages } from "./tooltips";
import { uiMessages } from "./ui";

/**
 * 本体アプリ（index.html）が使うメッセージ。
 *
 * [Intended] guide.html 専用の ./guide は意図的に含めない。
 * 本体バンドルにレシピ集の文言を載せないため、guide 側のエントリから
 * i18n.registerMessages() で登録する。
 */
export const appMessages = {
	...uiMessages,
	...settingMessages,
	...optionMessages,
	...tooltipMessages,
	...presetMessages,
	...processingMessages,
	...attributeMessages,
};

export const appMessageCatalogs = {
	ui: uiMessages,
	settings: settingMessages,
	options: optionMessages,
	tooltips: tooltipMessages,
	presets: presetMessages,
	processing: processingMessages,
	attributes: attributeMessages,
};
