#!/usr/bin/env python3
import subprocess
import sys
import concurrent.futures
import time

def run_task(name, command, show_success_output=False):
    """
    Execute the specified command and return success/failure and output.
    :param name: Task name
    :param command: Command to execute (list format)
    :param show_success_output: Whether to print captured output on success
    :return: (is_success, name, output, duration, show_success_output)
    """
    start_time = time.time()
    try:
        # Capture output and execute
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
    Execute a list of tasks in parallel.
    :param phase_name: Phase name (for logging)
    :param tasks: List of (name, command, show_success_output) tuples
    :return: Whether successful (bool)
    """
    if phase_name:
        print(f"--- {phase_name} ---")

    failed = False
    failure_details = []

    # The number of parallel workers is automatically adjusted according to the number of tasks.
    # ThreadPoolExecutor is sufficient since it's mostly I/O bound or lightweight wrappers.
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

    # Display failure details
    if failed:
        print("\n=== FAILURE DETAILS ===")
        for name, output in failure_details:
            print(f"--- {name} Output ---")
            print(output.strip())
            print("-----------------------")
        return False

    return True

def main():
    # Phase 1: Fix (Fixing tasks)
    # These may modify code, so run them before checks
    fix_tasks = [
        ("TS Fix", ["make", "ts-fix-diff"], False),
        ("HTML Fix", ["make", "html-fix-diff"], False),
    ]

    # The fix phase is often empty, but display it explicitly for clarity.
    if not execute_phase("Auto Fix Phase", fix_tasks):
        print("Fix phase failed. Stopping.")
        sys.exit(1)

    # Phase 2: Check (Verification tasks)
    # Perform checks on the fixed code
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
