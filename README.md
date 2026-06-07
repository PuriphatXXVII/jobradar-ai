<div align="center">

# 🎯 JobRadar AI

### A small team of AI agents that hunts remote jobs for you — every morning, automatically.

A **multi-agent pipeline**: a Scout **scrapes** job boards → an AI **Matcher** scores each role 0–100 against your profile (with reasons) → a **Reporter** builds a ranked digest → an **Orchestrator** runs the whole thing **daily on GitHub Actions** and commits the result back.

![Node](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-scraping-2EAD33?logo=playwright&logoColor=white)
![Claude](https://img.shields.io/badge/Claude-AI_ranking-D97757?logo=anthropic&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-daily_cron-2088FF?logo=github-actions&logoColor=white)
[![Daily run](https://github.com/PuriphatXXVII/remote-dev-jobs-scraper/actions/workflows/jobradar.yml/badge.svg)](https://github.com/PuriphatXXVII/remote-dev-jobs-scraper/actions/workflows/jobradar.yml)

</div>

---

## 🎯 What it does

Job hunting means scanning hundreds of postings, most of them irrelevant. JobRadar AI automates that as a **pipeline of four agents**, each with one job:

| Agent | Role |
|-------|------|
| 🛰️ **Scout** (`scrape.mjs`) | Scrapes remote dev/AI jobs from [RemoteOK](https://remoteok.com) with Playwright, then cleans the messy real-world data (SEO-spam tags, duplicates, stale archive rows). |
| 🤖 **Matcher** (`match.mjs`) | Sends the jobs + your `profile.json` to **Claude**, which scores each role **0–100** for fit and writes a one-line reason — returned as **structured JSON** so it's safe to sort. Falls back to keyword scoring when no API key is set. |
| 📊 **Reporter** (`report.mjs`) | Ranks the results and builds a **daily digest** — Markdown (`digest.md`) plus an email-ready HTML version (`digest.html`) — with fit metrics. |
| 🔗 **Orchestrator** (`run.mjs`) | Chains Scout → Matcher → Reporter into one command, times each stage, and is resilient (if scraping fails, it still ranks the existing data). |

The full pipeline runs **end-to-end in ~16 seconds**, replacing roughly **30–60 minutes/day** of manual searching — and it runs itself every morning.

---

## 📊 Metrics it reports (real output, every run)

Each run prints and commits a measurable summary, e.g.:

```
📊 JobRadar Digest · 2026-06-07
   scanned 237 postings → 34 relevant dev/AI roles
   ranked 0–100 by AI fit, with a one-line reason per job
   pipeline finished in 15.7s
```

The digest also reports the **average fit %** and how many roles clear the **"worth applying"** bar (fit ≥ 70).

> The fit score is produced by Claude judging stack match, seniority fit, domain interest, and location against your profile — not keyword counting. (A keyword baseline is built in as a fallback, which makes the difference easy to demonstrate: keyword matching happily ranks a *blockchain* role highly just because the title contains "javascript"; the AI matcher does not.)

---

## 🏗️ Architecture

```
              ┌──────────────┐
 RemoteOK ───▶│ 🛰️  Scout     │  scrape + clean  →  remote-dev-jobs.csv
              └──────┬───────┘
                     ▼
 profile.json ─────▶┌──────────────┐
                    │ 🤖 Matcher   │  Claude: score 0–100 + reason (JSON)
                    └──────┬───────┘  →  ranked-jobs.csv
                           ▼
                    ┌──────────────┐
                    │ 📊 Reporter  │  ranked digest + metrics
                    └──────┬───────┘  →  digest.md · digest.html
                           ▼
              🔗 Orchestrator (run.mjs)
                 └─ GitHub Actions cron → runs daily, commits the digest
```

---

## ⚙️ Run it locally

```bash
npm install
npx playwright install chromium     # first run only (for the Scout)

node run.mjs                         # whole pipeline  (or: npm start)
# or run a single agent:
npm run scrape   # 🛰️  scrape only
npm run match    # 🤖 rank only
npm run report   # 📊 digest only
```

**AI ranking is optional.** Set `ANTHROPIC_API_KEY` to use Claude; without it the Matcher uses a deterministic keyword fallback, so the full flow still works with **zero external services** (handy for development and CI).

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."   # PowerShell
node run.mjs
```

Edit **`profile.json`** to tune the matching to your own skills, seniority, interests, and the things you want to avoid.

---

## 🤖 Daily automation

[`.github/workflows/jobradar.yml`](.github/workflows/jobradar.yml) runs the pipeline every morning (08:00 ICT) and commits the fresh digest back to the repo — so the latest matches are always one click away. It can also be triggered manually from the **Actions** tab. Add an `ANTHROPIC_API_KEY` repository secret to enable AI ranking in CI.

---

## ⚖️ Scraping ethics

- ✅ Public data only (no login required)
- ✅ Respects `robots.txt` / ToS, scrapes gently (one pass, polite delays)
- ❌ Never private / behind-login data

---

## 🛠️ Tech

**Node.js (ESM)** · **Playwright** (scraping) · **Anthropic Claude** with structured JSON outputs (ranking) · **GitHub Actions** (daily cron). Zero-dependency-friendly: the only runtime deps are `playwright` and `@anthropic-ai/sdk`.

---

<div align="center">

Built by [**Puriphat Srikamnoi**](https://github.com/PuriphatXXVII) · [Portfolio](https://puriphatxxvii.github.io/my-portfolio/)

*A meta project: an AI agent team built to automate its author's own job hunt.*

</div>
