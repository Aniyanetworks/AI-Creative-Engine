# AI Creative Engine — Project Plan

**Goal:** An AI system that turns any business website into ready-to-run ads.
**Offer line:** "Give us your website, get 20 ready-to-run ads in 24 hours."
**Test sites:** AniyaNetworks.net, answerandbook.ca, buildpartner.cc
**Handoff:** Creatives go to Rehan (Track 2) for live Meta/TikTok testing.

> The readme gives no deadline. The timeline below assumes about 4 weeks. Adjust it if the real window is different.

## Deliverables (per business URL)

| # | Output | Count |
|---|--------|-------|
| 1 | Competitor ad analysis (from Meta Ad Library) | 1 report |
| 2 | Hooks / angles | 10 |
| 3 | Static ad creatives | 20 |
| 4 | Short video ads (AI avatar / UGC-style) | 5 |

Showcase: 3–5 min Loom demo and a 1-page case study.

## Phases

### Phase 1: Learn (Week 1)
- Study direct-response frameworks: hook, angle and offer. Write a one-page cheat sheet.
- Learn Meta Ad Library research: search by brand and keyword, and spot long-running ads (likely winners).
- Test prompting in Claude / ChatGPT for ad copy.
- Trial the image tools (Midjourney, Ideogram, Canva AI) and the video / UGC tools (HeyGen, Arcads, CapCut AI).
- Pick one tool per category by comparing quality, cost, speed and API or automation access.
- **Exit criteria:** cheat sheet done, tool stack chosen, one manual end-to-end ad produced.

### Phase 2: Manual prototype (Week 1–2)
- Run the whole flow by hand on **one** site (AniyaNetworks.net) to find what works.
- Save the winning prompts, the brand-extraction template and the creative briefs as reusable assets.
- **Exit criteria:** 10 hooks, a handful of statics and 1–2 videos, all reviewed for quality.

### Phase 3: Build the n8n pipeline (Week 2–3)
Input: business URL. Steps:
1. **Scrape and extract:** fetch the site, then extract the business, offer, audience, USPs, tone, brand colors/logo and imagery.
2. **Competitor analysis:** find competitors, pull their ads from the Ad Library (manually seeded if the API or scraping is limited), then summarize the angles, formats and offers.
3. **Hooks and angles:** the LLM produces 10, scored against the cheat sheet.
4. **Static creatives:** copy variants (headline, primary text, CTA), then image generation or Canva templates, giving 20 assets in the right sizes (1:1, 4:5, 9:16).
5. **Video ads:** write 5 scripts, then run avatar/voice generation with captions to produce 5 short videos.
6. **Package:** write everything to a folder or Drive plus a summary sheet, and notify by Slack or email.
- Add error handling, retries, logging and cost tracking per run.
- **Exit criteria:** one URL in, full asset pack out, with no manual steps except a final QA review.

### Phase 4: Test and refine (Week 3–4)
- Run the pipeline on all three sites: AniyaNetworks.net, answerandbook.ca, buildpartner.cc.
- QA checklist: on-brand, no false claims, readable text in images, platform policy compliant (Meta/TikTok).
- Fix the weakest stages and measure the end-to-end run time (target: under 24 hours, ideally much less).
- Hand the creatives to Rehan and agree on a feedback loop for performance data (CTR, CPA, hook rate).
- **Exit criteria:** 3 complete ad packs delivered, with feedback from Rehan.

### Phase 5: Showcase (Week 4)
- Record a 3–5 min Loom demo: URL in, assets out, pipeline walkthrough.
- Write a 1-page case study covering problem, process, outputs, results (or early test data) and the offer line.
- **Exit criteria:** both assets are finished and shareable.

## Milestones

| Milestone | Target |
|-----------|--------|
| Tool stack chosen, manual ad done | End of Week 1 |
| Manual prototype on site #1 | Mid Week 2 |
| Pipeline works end to end on one URL | End of Week 3 |
| All 3 sites delivered to Rehan | Mid Week 4 |
| Loom and case study done | End of Week 4 |

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Ad Library has no easy API or blocks scraping | Seed competitors by hand, use the official Ad Library API where it fits, or use a third-party scraper |
| AI images with garbled text or off-brand looks | Generate backgrounds with AI and overlay text via Canva or templates; add a QA step |
| Avatar videos look fake or cost too much | Test several tools early; use short scripts and captions; cap cost per run |
| Hitting 20 statics and 5 videos in 24 hours | Run generation in parallel in n8n and budget per-step time |
| Claims or policy violations in generated ads | Add a compliance check prompt and a human review before handoff |
| Weak site content gives weak output | Add fallbacks, such as asking for extra inputs or using competitor data |

## Daily routine
- Post a progress update at the 15-min standup: done yesterday, doing today, blockers.
- Keep a running log of prompts and tools tried, because it feeds the case study.

## Open questions
- What is the real deadline?
- Is there a budget cap for tools and API usage?
- Should Rehan receive raw assets, or a formatted pack with a copy sheet?
- Does the final deliverable need to work for any business, or are the 3 test sites enough for the demo?
