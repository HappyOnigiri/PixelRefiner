import { runCasesShard } from "../shard";

// [Intended] シャードごとに別ファイルへ分けるのは、vitest がテストファイル単位で
// プロセス並列化するため。1 ファイルにまとめると全ケースが直列実行になる。
runCasesShard(1);
