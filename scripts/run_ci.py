#!/usr/bin/env python3
import subprocess
import sys
import concurrent.futures
import time

def run_task(name, command, show_success_output=False):
    """
    指定したコマンドを実行し、成否と出力を返す。
    :param name: タスク名
    :param command: 実行するコマンド（リスト形式）
    :param show_success_output: 成功時に取得した出力を表示するか
    :return: (is_success, name, output, duration, show_success_output)
    """
    start_time = time.time()
    try:
        # 出力を取得しながら実行する
        result = subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )
        duration = time.time() - start_time
        return True, name, result.stdout, duration, show_success_output
    except subprocess.CalledProcessError as e:
        duration = time.time() - start_time
        return False, name, e.stdout, duration, show_success_output

def execute_phase(phase_name, tasks):
    """
    タスクのリストを並列実行する。
    :param phase_name: フェーズ名（ログ用）
    :param tasks: (name, command, show_success_output) タプルのリスト
    :return: 成功したか（bool）
    """
    if phase_name:
        print(f"--- {phase_name} ---")

    failed = False
    failure_details = []

    # 並列ワーカー数はタスク数に合わせて自動調整する。
    # 主に I/O 待ちや軽量なラッパー処理なので ThreadPoolExecutor で十分である。
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(tasks)) as executor:
        future_to_name = {
            executor.submit(run_task, name, cmd, show_output): name
            for name, cmd, show_output in tasks
        }

        for future in concurrent.futures.as_completed(future_to_name):
            success, name, output, duration, show_output = future.result()
            if success:
                print(f"✅ {name} ({duration:.2f}s)")
                if show_output and output.strip():
                    print(output.rstrip())
            else:
                print(f"❌ {name} ({duration:.2f}s)")
                failed = True
                failure_details.append((name, output))

    # 失敗の詳細を表示する
    if failed:
        print("\n=== FAILURE DETAILS ===")
        for name, output in failure_details:
            print(f"--- {name} Output ---")
            print(output.strip())
            print("-----------------------")
        return False

    return True

def main():
    # フェーズ 1: 修正（自動修正タスク）
    # コードを変更する可能性があるため、検査より先に実行する
    fix_tasks = [
        ("TS Fix", ["make", "ts-fix-diff"], False),
        ("HTML Fix", ["make", "html-fix-diff"], False),
    ]

    # 修正フェーズが空の場合も多いが、分かりやすいよう明示する。
    if not execute_phase("Auto Fix Phase", fix_tasks):
        print("Fix phase failed. Stopping.")
        sys.exit(1)

    # フェーズ 2: 検査（検証タスク）
    # 修正後のコードを検査する
    check_tasks = [
        ("TS Check", ["make", "ts-check-diff"], False),
        ("HTML Check", ["make", "html-check-diff"], False),
        ("Type Check", ["make", "type-check"], False),
        ("Custom Rules", ["make", "check-ts-rules"], False),
        ("TS Line Length", ["make", "check-ts-line-length"], False),
        ("File Line Count", ["make", "check-file-line-count"], True),
        ("Tests", ["make", "test"], False),
    ]

    if not execute_phase("Check Phase", check_tasks):
        print("Check phase failed.")
        sys.exit(1)

    print("\n[DONE] All CI tasks passed!")

if __name__ == "__main__":
    main()
