#!/usr/bin/env python3
import subprocess
import sys
import concurrent.futures
import time

def run_task(name, command):
    """
    Execute the specified command and return success/failure and output.
    :param name: Task name
    :param command: Command to execute (list format)
    :return: (is_success, name, output, duration)
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
        return True, name, result.stdout, duration
    except subprocess.CalledProcessError as e:
        duration = time.time() - start_time
        return False, name, e.stdout, duration

def execute_phase(phase_name, tasks):
    """
    Execute a list of tasks in parallel.
    :param phase_name: Phase name (for logging)
    :param tasks: List of (name, command) tuples
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
        ("TS Fix", ["make", "ts-fix-diff"]),
        ("HTML Fix", ["make", "html-fix-diff"]),
    ]

    # The fix phase is often empty, but display it explicitly for clarity.
    if not execute_phase("Auto Fix Phase", fix_tasks):
        print("Fix phase failed. Stopping.")
        sys.exit(1)

    # Phase 2: Check (Verification tasks)
    # Perform checks on the fixed code
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

    print("\n[DONE] All CI tasks passed!")

if __name__ == "__main__":
    main()
