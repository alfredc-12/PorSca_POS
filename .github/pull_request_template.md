## Intent

Issue: #

What user-visible behavior or project outcome does this change provide?

## Scope

- [ ] Mobile-only
- [ ] Cross-repository change
- [ ] Documentation or workflow only

Changed behavior and files:

## Contract and safety

- [ ] I inspected the current mobile/API contract.
- [ ] I updated the API repository and opened a paired PR when the contract changes.
- [ ] I did not add direct network calls outside `src/api/client.ts`.
- [ ] No credential, token, webhook secret, or authorization header is present in the change.
- [ ] Payment, inventory, and idempotency rules remain authoritative on Laravel.

## Verification

- [ ] `npm run verify`
- [ ] Device or emulator check performed when the installed app is affected.
- [ ] Cross-repository verification performed when the API contract is affected.

Commands and results:

## Review notes

Known limitations, assumptions, migration or seed-data impact, rollback notes, and follow-up work:

## QA boundary

- [ ] This change does not create or start a formal QA cycle.
- [ ] If this is a formal QA change, I linked the human-created cycle record.
- [ ] I am not claiming formal QA approval or release promotion.
