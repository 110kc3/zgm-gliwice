## Workflow Rules
- **Task Execution:** When taking a task from the TODO file, ALWAYS verify the exact file paths using `ls` or `grep` first. 
- **No Guessing:** Do not create new files or edit existing ones unless you are 100% certain of the architecture. If multiple files share similar names, ask for clarification before proceeding.

## Testing & Output Rules (CRITICAL)
- **Zero-Bloat Testing:** NEVER output passing test results to the terminal. I strictly only want to see failures.
- **Enforce Quiet Flags:** When running tests, you MUST use the runner's built-in flags to suppress successful tests and standard output (e.g., `--quiet`, `--silent`, `-q`, `--fail-fast`, or `--reporter=dot`).
- **Use Grep if Necessary:** If the test runner cannot be silenced natively, you MUST pipe the command to filter out passing lines (e.g., `| grep -iE "fail|error|exception"`).
- **Targeted Testing Only:** Do not run the global test suite unless explicitly asked. Only run the specific test file associated with your current TODO task.

## Code style

- Do not add comments to code. Make code self-explanatory through descriptive
  names, small focused functions and clear control flow. Put rationale and usage
  explanations in Markdown documentation.
