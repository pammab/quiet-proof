# Quiet Proof

**A private back office for freelancers.** Your receipts, statements, contracts and client emails are read on your own device with Gemini Nano. The cloud only sees anonymized totals, and only when you say yes. Every day it answers one question: **how much can I safely spend this month?**

Built for #BuildHybridAI 2026 with Firebase AI Logic hybrid inference.

> Work in progress. Education only, not tax, legal or financial advice.

## Why hybrid
| Task | Where it runs | Why |
| --- | --- | --- |
| Read receipts, invoices, bank statement lines, contracts, emails | On device (Gemini Nano) | Private, high volume, free |
| Short drafts (payment reminders, labels) | On device first, cloud fallback | No private documents involved |
| Quarterly tax plan, explanations, income letter | Cloud (Gemini) | Needs stronger reasoning; receives anonymized totals only, after the user approves the exact payload |

Money math (taxes, reserves, forecasts, risk) is done by deterministic, tested code. The AI reads and explains; it never computes amounts.

## Pre-existing work (disclosure)
This project starts from **SteadPal** (github.com/pammab/steadpal, MIT), an entry to the PayPal AI Hackathon. The first commit of this repository (tag `baseline-steadpal-v1`) is an exact copy of SteadPal at commit 705e46c (Nov 11, 2026). Reused: the income engine (`web/engine/core.js`, `web/engine/analysis.js`) and its tests. Everything after that commit was built during the #BuildHybridAI submission period. `legacy/` holds the old server and UI for reference while porting and will be removed before submission.

## Run locally
```bash
npm test     # engine checks
npm start    # serves web/ at http://localhost:5000
```
Setup: fill `web/firebase-config.js` with your Firebase web app config and App Check site key. Chrome desktop 139+ with `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` enabled is needed for on-device inference.

## License
MIT. See `LICENSE`.
