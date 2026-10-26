#!/usr/bin/env python3
"""Pre-push safety checks for repository work that a commit-only guard cannot see."""
import subprocess
import sys


def git(*args):
    result = subprocess.run(['git', *args], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout.strip()


def fail(message):
    print(f"pre-push guard: FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def stash_entries():
    output = git('stash', 'list', '--format=%gd%x09%gs')
    return [line.split('\t', 1) for line in output.splitlines() if '\t' in line]


def main():
    branch = git('symbolic-ref', '--quiet', '--short', 'HEAD')
    status = git('status', '--porcelain=v1', '--untracked-files=all')
    if status:
        fail(f"working tree is not clean on {branch}; commit or stash after explicit review:\n{status}")

    branch_stashes = [(stash, subject) for stash, subject in stash_entries()
                      if subject.endswith(f"On {branch}: ") or f"On {branch}: " in subject]
    if branch_stashes:
        details = '\n'.join(f"  {stash}: {subject}" for stash, subject in branch_stashes)
        fail(f"stash entries belong to pushed branch {branch}; apply, review, or drop explicitly:\n{details}")

    lines = [line for line in sys.stdin.read().splitlines() if line.strip()]
    if not lines:
        return

    push_refs = []
    for line in lines:
        fields = line.split()
        if len(fields) != 4:
            fail(f"invalid pre-push ref record: {line}")
        push_refs.append(tuple(fields))

    for local_ref, local_oid, remote_ref, remote_oid in push_refs:
        if local_oid == '0' * 40:
            continue
        if remote_oid == '0' * 40 or remote_oid == local_oid:
            continue
        # D167: --is-ancestor answers by exit code only (0 = the remote tip is in the pushed commit, 1 = it is not); any other
        # code is a real Git error (an unknown object, a broken repository) and is shown as it is
        check = subprocess.run(['git', 'merge-base', '--is-ancestor', remote_oid, local_oid], capture_output=True, text=True, encoding='utf-8', errors='replace')
        if check.returncode == 0:
            continue
        if check.returncode != 1:
            fail(f"git merge-base --is-ancestor failed (exit {check.returncode}): {check.stderr.strip() or 'no message'}")
        remote_branch = remote_ref.removeprefix('refs/heads/')
        fail(f"remote branch {remote_branch} has commits missing from {local_oid[:12]}; fetch and resolve before pushing")


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as error:
        fail(str(error))
