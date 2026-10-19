---
name: shell-pr-body
description: Use when preparing a PR, especially for setup, contract, or workflow changes. Load before gh-axi pr create or pr edit, including Markdown bodies with code spans or paths.
user-invocable: false
internal: true
---

# PR preparation

## Map reconciliation

Before opening a PR that changes setup, the API contract, or the workflow:

1. Read `AGENTS.md` and the changed owning documents.
2. Compare the map's claims and pointers with those documents. Update only map facts that are stale or inaccurate; keep details in their owning documents.
3. For API changes, read the selected revision's contract header before health or smoke checks. A contract version written in this map does not establish what is deployed on staging.
4. State in the PR description which map facts were reconciled, or say that no map facts required correction.

## Passing the description through the shell

PR descriptions commonly contain Markdown backticks, dollar signs, and other characters that shell interpolation can change. Do not pass a Markdown body in an inline double-quoted shell argument.

Write the description to a file with a quoted heredoc, then pass the file to `gh-axi`:

```sh
body_file=$(mktemp)
cat > "$body_file" <<'EOF'
## Summary
Describe the change.

## Map reconciliation
- State which map facts were reconciled.
EOF
gh-axi pr create --title 'Describe the change' --base development --body-file "$body_file"
rm -f "$body_file"
```

A checked-in or otherwise prepared body file may also be passed with `--body-file`. Keep the body literal when writing it; avoid unquoted heredocs and inline double-quoted Markdown.
