#!/usr/bin/env bash
# infra/guard/install-hooks.sh - installs local git hooks that run the agent guard (fast feedback). `git commit --no-verify` skips local hooks, so CI (infra/github-actions-guard.yml) is the real wall.
set -eu
ROOT="$(git rev-parse --show-toplevel)"; HOOKS="$ROOT/.git/hooks"
cat > "$HOOKS/commit-msg" <<'HOOK'
#!/usr/bin/env bash
# checks the staged change together with the commit message (the Task / Change-Request / Release trailers live in the message)
exec python3 "$(git rev-parse --show-toplevel)/infra/guard/agent_guard.py" --staged --msg-file "$1"
HOOK
cat > "$HOOKS/pre-push" <<'HOOK'
#!/usr/bin/env bash
# checks every commit that is about to be pushed against the integration branch
ROOT="$(git rev-parse --show-toplevel)"
python3 "$ROOT/infra/guard/pre_push_guard.py" || exit $?
BASE="${GUARD_BASE:-origin/develop}"
git rev-parse --verify -q "$BASE" >/dev/null || BASE="$(git rev-list --max-parents=0 HEAD | tail -1)"
exec python3 "$ROOT/infra/guard/agent_guard.py" --base "$BASE" --head HEAD
HOOK
chmod +x "$HOOKS/commit-msg" "$HOOKS/pre-push"
echo "installed commit-msg and pre-push hooks in $HOOKS"
