#!/usr/bin/env python3
import subprocess
import sys
import concurrent.futures
import time

def run_task(name, command):
    """
    指定されたコマンドを実行し、成功・失敗と出力を返す。
    :param name: タスク名
    :param command: 実行するコマンド（リスト形式）
    :return: (is_success, name, output, duration)
    """
    start_time = time.time()
    try:
        # 出力をキャプチャして実行
        result = subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )
        duration = time.time() - start_time
        return True, name, result.stdout, duration
    except subprocess.CalledProcessError as e:
        duration = time.time() - start_time
        return False, name, e.stdout, duration

def execute_phase(phase_name, tasks):
    """
    タスクのリストを並列実行する。
    :param phase_name: フェーズ名（ログ用）
    :param tasks: (name, command) のタプルのリスト
    :return: 成功したかどうか (bool)
    """
    if phase_name:
        print(f"--- {phase_name} ---")

    failed = False
    failure_details = []

    # 並列数はタスク数に応じて自動調整される (デフォルトはCPU数依存だが、I/Oバウンドに近いので多めでもOK)
    # makeコマンド自体が軽量なラッパーであることが多いので、ThreadPoolExecutorで十分
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(tasks)) as executor:
        future_to_name = {
            executor.submit(run_task, name, cmd): name
            for name, cmd in tasks
        }

        for future in concurrent.futures.as_completed(future_to_name):
            success, name, output, duration = future.result()
            if success:
                print(f"✅ {name} ({duration:.2f}s)")
            else:
                print(f"❌ {name} ({duration:.2f}s)")
                failed = True
                failure_details.append((name, output))

    # エラー詳細の表示
    if failed:
        print("\n=== FAILURE DETAILS ===")
        for name, output in failure_details:
            print(f"--- {name} Output ---")
            print(output.strip())
            print("-----------------------")
        return False

    return True

def main():
    # Phase 1: Fix (修正タスク)
    # これらはコードを変更する可能性があるため、チェックの前に実行する
    fix_tasks = [
        ("TS Fix", ["make", "ts-fix-diff"]),
        ("HTML Fix", ["make", "html-fix-diff"]),
    ]

    # fix phase は何もないことが多いので、ヘッダーを控えめにしてもいいが、明確にするために表示
    if not execute_phase("Auto Fix Phase", fix_tasks):
        print("Fix phase failed. Stopping.")
        sys.exit(1)

    # Phase 2: Check (検証タスク)
    # 修正後のコードに対してチェックを行う
    check_tasks = [
        ("TS Check", ["make", "ts-check-diff"]),
        ("HTML Check", ["make", "html-check-diff"]),
        ("Type Check", ["make", "type-check"]),
        ("Custom Rules", ["make", "check-ts-rules"]),
        ("Non-ASCII Check", ["make", "check-non-ascii"]),
        ("Tests", ["make", "test"]),
    ]

    if not execute_phase("Check Phase", check_tasks):
        print("Check phase failed.")
        sys.exit(1)

    print("\n🎉 All CI tasks passed!")

if __name__ == "__main__":
    main()
