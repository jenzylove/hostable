# Security

## What Hostable stores

- **Community input:** country codes and counts only. No names, emails, passports or other personal data are accepted by the API.
- **Organization workspaces:** an organization name, its country counts, its scoring runs and the agent's decisions. Access needs a secret key that is shown once at creation; only a SHA 256 hash of the key is stored in the graph. The key itself lives in the organizer's browser.

## How the API is protected

- Every Cypher query is parameterised. User input is never concatenated into a query.
- Inputs are validated: country codes must be three capital letters, counts must be positive and bounded, city ids must match known ids, malformed bodies return 400 with a plain message, and server errors return a generic message.
- The agent endpoint is rate limited per caller, questions are capped at 500 characters, and the agent can only call fixed graph tools. Decision writes are capped per organization and city.
- The page renders all API text with `textContent`, never raw HTML, and is served with `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.
- Secrets (database URL, model key) live only in the host's environment settings, never in the repository.

## Reporting a problem

Open a private security advisory on this repository (Security tab, Report a vulnerability). Please include steps to reproduce. I aim to reply within a few days.
