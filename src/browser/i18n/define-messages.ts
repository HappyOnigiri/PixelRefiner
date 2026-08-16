import type { Language } from "./language";

// 1 つのキーに対する全言語の訳文
export type MessageEntry = Record<Language, string>;

// メッセージモジュール 1 ファイル分の定義
export type MessageCatalog = Record<string, MessageEntry>;

/**
 * メッセージ定義を型を保ったまま受け取る。
 *
 * [Intended] 引数を MessageCatalog で受けずに T のまま返すことで、
 * 1) 訳文が Record<Language, string> を満たさない（= 言語の登録漏れがある）と
 *    その場で型エラーになり、2) 呼び出し側にキー名のリテラル型が伝わって
 *    ResourceKey が全キーの union になる、の 2 つを同時に成立させる。
 */
export const defineMessages = <T extends MessageCatalog>(messages: T): T =>
	messages;
