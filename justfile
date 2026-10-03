set shell := ["sh", "-eu", "-c"]

setup:
    mise install node pnpm

doctor:
    test -x "$HOME/.local/bin/dev-doctor" || { echo 'Install the shared dev-doctor in ~/.local/bin first' >&2; exit 1; }
    "$HOME/.local/bin/dev-doctor" --project .

check:
    mise exec -- pnpm validate
