## Summary

<!-- What does this PR do? Keep it brief. -->

## Security checklist

- [ ] No secrets, tokens, or session data in committed files
- [ ] No new npm dependencies added (if added: justify below)
- [ ] `package-lock.json` integrity hashes are present for all deps
- [ ] Changes to `upload.mjs` reviewed for session cookie handling
- [ ] Changes to browser automation reviewed for data exfiltration risk

## Dependency changes

<!-- If adding/updating dependencies, explain why and note the supply chain impact. -->

N/A

## Test plan

- [ ] Ran `./gh-embed-image --login` and verified session is saved
- [ ] Uploaded an image and verified the URL renders in a GitHub issue/PR
- [ ] Tested `--pr` flag to embed in a PR description
- [ ] Tested with expired session (should prompt re-login)
