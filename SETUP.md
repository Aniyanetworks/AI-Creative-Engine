# AI Creative Engine: Setup

URL in, ad pack out: brand brief, competitor analysis, 10 hooks, 20 static ads (rendered images in Google Drive), 5 video ad scripts (rendered videos if HeyGen is configured).

## Where it lives
- **n8n:** https://n8n.srv1300653.hstgr.cloud, folder **Personal / AI Creative Engine**, workflow "AI Creative Engine: URL to Ad Pack" (id `EqEAvU44AUhA4yA7`). It is **inactive**.
- **Webhook path:** stored in `workflow/.webhook-path` (random, so the URL isn't guessable). Test URL: `https://n8n.srv1300653.hstgr.cloud/webhook-test/<path>`, production URL: `.../webhook/<path>` (only works once the workflow is active).

## Files

| Path | Purpose |
|---|---|
| `workflow/creative-engine.n8n.json` | The workflow (generated) |
| `prompts/*.md` | The 5 prompts. Edit these to tune output quality |
| `tools/build_workflow.js` | Rebuilds the workflow from the prompts: `node tools/build_workflow.js` |
| `tools/deploy_n8n.js` | Pushes it to n8n via the API (needs `N8N_API` in `.env`; use `NODE_OPTIONS="--dns-result-order=ipv4first"` on this machine) |
| `tools/heygen_list.js` | Lists your HeyGen avatars and voices so you can pick the IDs: `node tools/heygen_list.js English` |
| `.env.example` | Names of the optional keys (HeyGen, Apify, Drive folder) that `deploy_n8n.js` copies into the Config node |
| `tools/mock_test.js` | Offline test of the whole graph with mocked services: `node tools/mock_test.js` |
| `sample-input.json` | Example webhook body |

## Pipeline

Webhook → Config → Fetch Website → Brand Brief → Competitor Analysis → Hooks and Angles → Static Concepts → (if rendering) Split → OpenAI Image → Make Image File → Upload To Drive → Collect Images → Video Scripts → Render Videos → Package and Deliver → Make Report File → Upload Report → Final Output

Each writing step is three nodes: a prep Code node, an HTTP Request node using the n8n **Anthropic account** credential, and a parse Code node.

## Also built in
- **Brand detection:** Fetch Website reads the page source for dominant brand colours (greys and white ignored), the logo and the share image. The brief step uses them, and they flow into the image prompts.
- **Hand-off:** the full report is saved to Drive as `<business>_ad-pack_<date>.md`; `report_drive_url` in the final output is the link to send Rehan.

## Adding HeyGen (when you have the key)
1. Put `HEYGEN_API_KEY=` in `.env`.
2. `node tools/heygen_list.js English` to see avatar and voice IDs; put the two you want in `.env`.
3. `NODE_OPTIONS="--dns-result-order=ipv4first" node tools/deploy_n8n.js` pushes them into the Config node.
4. Test with `max_videos` = 1 first.

## Credentials used (all already in n8n; no keys inside the workflow)
| Step | Credential |
|---|---|
| All writing steps | Anthropic account |
| Static images (`gpt-image-2`; set `IMAGE_MODEL` in `.env` to change) | Manam- OpenAi account |
| Storing images | Manam Google Drive account (uploads to `drive_folder_id` in Config, default My Drive root) |

**Not in n8n, so optional:** `heygen_key` / `heygen_avatar_id` / `heygen_voice_id` (rendered videos; without them you get scripts only) and `apify_token` (real Meta Ad Library data). Set them in the **Config** node.

## Running it
1. In n8n, open the workflow and check that the three credentials are attached (they are set by id; if n8n shows a credential error on a node, re-select the credential there).
2. **Dry run first:** click Execute workflow, then send
   ```
   curl -X POST https://n8n.srv1300653.hstgr.cloud/webhook-test/<path> -H "Content-Type: application/json" -d @sample-input.json
   ```
   `dry_run: true` runs every writing step but skips image and video rendering, so it costs cents.
3. **Image test:** set `"dry_run": false` and `max_images` = 1 in Config. Check the Drive file and the cost.
4. **Full run:** `max_images` = 20. Activate the workflow to use the production URL (anyone with the URL can spend your API credits, so keep the path private).
5. The result is in the **Package and Deliver** node output (`report_markdown` holds the whole pack). Pass `callback_url` in the request to have it POSTed elsewhere.

## Webhook body

| Field | Required | Meaning |
|---|---|---|
| `url` | yes | Business website |
| `business_name` | no | Overrides the extracted name |
| `competitor_notes` | no | Competitor ads or notes you found by hand in the Ad Library |
| `dry_run` | no | `true` skips image/video rendering |
| `callback_url` | no | Receives the finished pack as a POST |
| `max_images` / `max_videos` | no | Override the Config limits for this run (use `0` to skip) |
| `job_id` | no | Free-form id the web app uses to find its own execution |

## Things to know
- **Not yet run against the real services.** The graph passes an offline test with mocked Anthropic, OpenAI and Drive, but I haven't executed it in n8n. Likely first-run fixes: the Google Drive node's folder setting, `gpt-image-1` access (OpenAI may require organisation verification; if so, set `image_model` to `dall-e-3` and expect a different response format), and the Apify actor's field names.
- **Images:** the model puts short overlay text in the image. AI image text is sometimes garbled, so check every image before use.
- **Competitor analysis is honest about its source.** Meta's official Ad Library API only returns political and EU ads. Without Apify or hand-collected notes, the step labels its output `inferred`.
- **Review before spending ad money.** Prompts limit claims to what the site states and the report lists `claims_to_verify`, but a person should check each ad for accuracy and Meta/TikTok policy.
- **Timing:** the writing steps take a few minutes. Image rendering adds roughly 1–3 minutes for 20 images; videos wait up to 20 minutes.

## Web app (React UI)
Run: `cd app && npm run dev`, then open http://localhost:5173. Restart it after pulling code changes (the server has no auto-reload).

### Storing runs in Supabase (optional)
Without these settings, runs are kept in `app/server/data/jobs.json` and results are re-read from n8n's execution history. With Supabase, finished runs are saved in the database, so they stay available after n8n prunes its history and survive a different machine.
1. Open your Supabase project > SQL Editor > New query, paste `supabase/schema.sql`, Run. It creates `public.ace_runs` with row-level security on and no policies, so the public anon key can read nothing.
2. Add to `.env`: `SUPABASE_URL=https://<project>.supabase.co` and `SUPABASE_SERVICE_KEY=<service_role key>` (Project Settings > API). The key stays on the backend; the browser never sees it.
3. Restart `npm run dev`. If the connection or table is wrong, the app shows a red "Run storage … is not working" banner with the reason.
Runs created before you enabled Supabase stay in the local file and do not appear in the database.

### Accounts, approval and password change
With Supabase configured, the app requires sign-in (Supabase Auth, email + password).
- **Sign-up is open, but nobody can run anything until an admin approves them.** New accounts land on a "Waiting for approval" screen. Admins approve or revoke people in the **Users** screen (sidebar).
- **Become the admin:** put your sign-up email in `.env` as `ADMIN_EMAILS=you@example.com`, restart `npm run dev`, then create your account in the app. Admin emails are approved automatically on first sign-in. Only admins can switch the n8n workflow on and off.
- **Privacy:** each person sees only their own runs. Admins see everyone's, including runs created before accounts existed.
- **Cost guard:** non-admins can have at most 2 runs in progress at once.
- **Change password:** sidebar bottom, click your email to open **Account**: enter the current password, then the new one twice. The current password is checked first.
- **Email confirmation:** Supabase currently requires new users to confirm their email, and its built-in mailer allows only a few emails per hour. For a smoother start, turn off *Confirm email* under Authentication > Sign In / Providers > Email, or set up your own SMTP.
- Set `AUTH_REQUIRED=false` in `.env` to switch sign-in off (single-user local use).
- Database: `supabase/schema.sql` includes the extra table (`ace_profiles`) and `user_id` column; it is safe to re-run.

## Deploying to Netlify
Netlify serves the React app from its CDN and runs the backend as one Netlify Function (`app/netlify/functions/api.mjs`, wrapping the same Express app). A scheduled function (`sync.mjs`, every minute) finishes unfinished runs even when nobody has the page open. Config lives in `netlify.toml` and overrides the Netlify UI fields (Base `app`, Build `npm run build`, Publish `dist`, Functions `netlify/functions`).

1. Push the repo to GitHub, then in Netlify: Add new site > Import from Git > pick the repo, branch `main`. Leave the build fields as they are (or fill the values above).
2. Site configuration > Environment variables. Add these (mark the secret ones as **Secret**):

| Variable | Value |
|---|---|
| `N8N_BASE_URL` | your n8n address, e.g. `https://n8n.example.com` |
| `N8N_API` | n8n API key (secret) |
| `N8N_WEBHOOK_PATH` | the path from `workflow/.webhook-path` (secret) |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase **secret** key (secret) |
| `ADMIN_EMAILS` | your admin email(s), comma separated |

   Optional: `HEYGEN_*` and `APIFY_TOKEN` are set in the n8n workflow, not here.
3. Deploy. Then in Supabase > Authentication > URL Configuration, set **Site URL** to your Netlify address and add it under **Redirect URLs**, so confirmation emails return to the live site.
4. The n8n workflow itself stays on your n8n server; Netlify only calls it.

Notes: the API function has Netlify's default time limit (10 s on free plans). Normal requests take under 2 s, but a slow n8n could exceed it; a failed poll just retries 3 seconds later. Without Supabase configured, Netlify has no persistent storage, so Supabase is required there.

## Videos (Claude-directed motion graphics, rendered with Remotion)
Anthropic has no video or avatar model, so the videos are *directed* by Claude and rendered by code. The workflow's video step writes a storyboard for each of the 5 videos: scenes with a headline, one highlighted word, an icon, a subtitle and the voiceover line. `video/` turns each storyboard into a 1080x1920 MP4: animated brand-coloured text, icons, word-synced captions, sound effects and an ElevenLabs voiceover. No human or avatar appears on screen. (HeyGen is still supported as an optional extra: set `heygen_*` in the workflow's Config node.)

One-time setup: `cd video && npm install` (already done if you used the project as-is). Add `ELEVENLABS_API_KEY=` to `.env`.

Render a finished run (the app's Videos tab shows the exact command with the run id):
```
cd video
node render.mjs <runId>          # run saved in Supabase
node render.mjs --file pack.json # or a pack downloaded from the Report tab
node render.mjs --demo           # sample video, checks rendering works on this machine
```
Options: `--only 1,3` (some videos), `--no-voice` (silent with captions), `--stills 20,90` (also save PNG frames to inspect the design), `--crf 18` (quality). Videos land in `video/out/<run>/`. The first run downloads a headless Chrome (about 100 MB). `npm run studio` opens Remotion Studio for live previews.

How it fits together: ElevenLabs returns the audio plus the exact time of every character, so scene changes land on the words they belong to and the captions highlight the spoken word. Colours come from the client's detected brand colours, so each client's videos match their site.

### Rendering videos online (GitHub Actions)
Instead of running `node render.mjs` yourself, the app can render the videos in the cloud, for free, on GitHub's runners. The five videos render in parallel (about 5 to 8 minutes), then appear in the run's **Videos** tab with a player and a download button.

How it works: the app calls the GitHub API to start `.github/workflows/render-videos.yml`. The workflow loads the run from Supabase, renders each video (ElevenLabs voiceover, Remotion), uploads the MP4s to a private Supabase Storage bucket (`ace-videos`, created automatically) and writes `<run id>/status.json`. The app reads that file and hands the browser short-lived signed links, so videos are never public. No database change is needed.

**When it runs:** automatically when a **full run** finishes (it renders the 5 videos), and on demand with the **Render videos online** button for dry runs and image tests. Each render uses roughly 2,500 ElevenLabs credits, which is why dry runs don't render by themselves. An automatic trigger never restarts a failed render; only the button does.

One-time setup (about 5 minutes):
1. **Push the repo** so `.github/workflows/render-videos.yml` is on `main`.
2. **GitHub secrets.** Put `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `ELEVENLABS_API_KEY` in your local `.env`, then run `node video/ci/set-secrets.mjs` (needs the GitHub CLI, `gh auth login`). It copies them into the repository's secrets without printing them. Or add them by hand: repo > Settings > Secrets and variables > Actions. Optionally add a repository *variable* `ELEVENLABS_VOICE_ID`.
3. **A token for the app to start the workflow.** GitHub > Settings > Developer settings > Fine-grained tokens > Generate: *Only select repositories* > this repo, permission **Actions: Read and write**. Put it in `.env` as `GH_DISPATCH_TOKEN=` and add the same variable on Netlify (mark it Secret). Without it the Videos tab keeps showing the "render on your computer" command.
4. Restart `npm run dev` (and redeploy Netlify).

Troubleshooting: the Videos tab shows the failure reason and a link to the GitHub Actions log. To run it by hand: GitHub > Actions > *Render videos* > Run workflow > paste the run id. A render that has not finished after 45 minutes is reported as failed. Videos over 50 MB are refused by Supabase's free plan; lower the quality in `render.mjs` (`--crf`) if that ever happens.

Tests: `node tools/test_render.mjs` (141 checks against stand-ins for Supabase Storage and the GitHub API; no accounts or credits needed).

### Choosing the voice
Before a render, the Videos tab has a **Voiceover voice** menu (your choice is remembered in the browser). It lists your ElevenLabs account's voices when the key has the **Voices: Read** permission (add `ELEVENLABS_API_KEY` to Netlify too, so the app can list them); otherwise it shows ElevenLabs' stock voices. Pick *Other* to paste any voice id from ElevenLabs > Voices. The choice goes to the workflow as an input and falls back to the `ELEVENLABS_VOICE_ID` repository variable.

### Google Drive (through n8n): folders, copies, and clean-up on delete
Everything for a run is filed in your Drive folder (`DRIVE_FOLDER_ID` in `.env`, also used by the main workflow) like this:

```
<your folder>/
  <business name>/
    <date> · <first 6 characters of the run id>/
      Static ads/      the generated images
      Videos/          the rendered MP4s
      <business>_ad-pack_<date>.md   the report
```

Set-up (uses the Drive credential you already have in n8n):
1. `NODE_OPTIONS="--dns-result-order=ipv4first" node tools/deploy_drive_n8n.js` creates and activates the n8n workflow **ACE - Save video to Drive**: a private webhook that finds or creates folders, receives videos, and moves folders to the Drive bin. Its private URL is kept in `workflow/.drive-webhook-path` (git-ignored). Run it again after changing `DRIVE_FOLDER_ID`.
2. `node tools/build_workflow.js` then `node tools/deploy_n8n.js` re-deploy the main workflow so images and the report use the same folders.
3. `node video/ci/set-secrets.mjs` copies the URL to the GitHub secret `N8N_DRIVE_WEBHOOK_URL`.
4. **Netlify:** add the same URL as the environment variable `N8N_DRIVE_WEBHOOK_URL` (Secret), so that removing a run in the deployed app can delete its folder. Locally the app reads `workflow/.drive-webhook-path` itself. Print the URL with `echo "$N8N_BASE_URL/webhook/$(cat workflow/.drive-webhook-path)"` (Git Bash).

Behaviour:
- Every render also uploads to Drive (best effort: a Drive failure never fails a render); each video shows **Open in Drive**. For videos rendered earlier, **Save to Google Drive** in the Videos tab copies the stored videos without re-rendering (no credits).
- **Removing a run in the app** moves its Drive folder to the **Drive bin** (recoverable for 30 days; it never deletes permanently) and deletes the stored videos from Supabase. If Drive cannot be reached the run is still removed and the app says so. Runs made before this feature (files loose in the root folder) are not touched.
- n8n accepts uploads up to its payload limit (16 MB by default; 20 MB tested). Raise `N8N_PAYLOAD_SIZE_MAX` on the n8n server if videos get bigger.

### Rendering only some videos
Each video card has a **Render** tick box. The button then says "Render 2 selected" and the credit estimate (about 500 per video) updates. Videos you do not tick keep their earlier files. Automatic renders after a full run always do all five.

### Generate one image / render one video from the app
- **Static ads tab:** every ad has **Generate image** (or **Make again**). It calls the n8n workflow **ACE - Render one image** (`node tools/deploy_image_n8n.js`, deploy the Drive workflow first): OpenAI makes the image (about 4 cents at medium quality; set `IMAGE_QUALITY=low|medium|high` in the server environment) and it is saved to `<business>/<date · run>/Static ads/` in Drive. The card shows "Making image…" and fills in when the file lands (usually under a minute). For Netlify add `N8N_IMAGE_WEBHOOK_URL` (Secret; the URL is printed by the deploy script).
- **Videos tab:** every card has **Render this video**. It asks for the voice each time (pre-filled with your last choice), then renders only that video (about 500 ElevenLabs credits).
- **Image model:** the OpenAI account in n8n has no `gpt-image-1` (its model list shows `gpt-image-2`, `gpt-image-1.5` and `gpt-image-1-mini`), so the workflows use `gpt-image-2`. If you re-deploy with a different model, set `IMAGE_MODEL` in `.env` and run `tools/deploy_n8n.js` and `tools/deploy_image_n8n.js`.

### Post tags
Claude now writes 6 to 8 hashtags for every static ad and video (mix of broad, niche and, if the brief names a place, local tags). They show as chips on each card with **Copy tags**; **Copy ad copy / Copy ad caption** includes them, and the saved report lists them. Runs made before this change have no tags (run them again).

### Usage and cost report (per account)
Sidebar > **Usage and cost**. Admins see every account (runs, images, videos, Claude / image / voice cost, per-day bars, per-run table, **Export CSV**; click an account to filter); everyone else sees only their own usage.
- **One-time database step:** run the last section of `supabase/schema.sql` (the `ace_usage` table) in your Supabase project's SQL Editor. Until then the page says tracking is off and everything else keeps working.
- **What is counted:** Claude tokens of each finished run (read from the n8n execution), images made by a run or by the **Generate image** button (charged to the person who clicked, by quality), and videos rendered (voice credits, charged to whoever started the render; automatic renders go to the run's owner). Only usage from the day tracking was switched on is recorded.
- **Costs are estimates at list prices, not a bill.** Defaults: Claude $3 in / $15 out per million tokens, images $0.01 / $0.04 / $0.17 (draft / standard / high), voice 500 credits per video at $0.20 per 1,000 credits. Override with `PRICE_CLAUDE_INPUT_PER_MTOK`, `PRICE_CLAUDE_OUTPUT_PER_MTOK`, `PRICE_IMAGE_LOW|MEDIUM|HIGH`, `ELEVENLABS_CREDITS_PER_VIDEO`, `PRICE_ELEVENLABS_PER_1K_CREDITS` (also on Netlify). The provider dashboards remain the source of truth.

### Image previews on the cards
Finished images are private Drive files, so the page cannot link to them directly. The app asks the n8n workflow **ACE - Get image** (`node tools/deploy_preview_n8n.js`) for Drive's own short-lived picture link for the file and shows that, with a "Loading preview…" state while Drive prepares a thumbnail (a just-made image can take a few seconds). Only files named like the app's ads (`..._static_<n>.png`) are ever answered, and nothing is downloaded through n8n or the app. On Netlify add `N8N_PREVIEW_WEBHOOK_URL` (Secret; printed by the deploy script). While an image is being remade the old picture is dimmed with "Making a new image…" until the new one is saved.

The webhook paths in `workflow/.*-webhook-path` are secrets (they are git-ignored). If one is ever committed or shared, delete that file and run the matching `tools/deploy_*_n8n.js` again: it creates a new path and the old URL stops working.

The same numbers are shown for a single run: an **Est. $x.xx** chip in the run header (next to Finished) opens a breakdown of Claude tokens, images by quality and videos for that run.

### Generate more, rewrite, and switching AI models
- **Generate more:** Hooks, Static ads and Videos each have **Generate more ...** (how many, plus an optional focus such as "local businesses"). **Rewrite** on any hook, ad or script asks Claude to improve that one item (optionally with an instruction); its number stays the same. A rewritten ad or script marks its old picture or video as out of date until you make it again. Limits: 10 hooks, 10 ads or 5 scripts per request; 40 hooks, 60 ads or 15 scripts per run. This uses the n8n workflow **ACE - Write more** (`node tools/deploy_write_n8n.js`); on Netlify add `N8N_WRITE_WEBHOOK_URL` (Secret, printed by the script). Each request is logged in the usage report.
- **Models:** New run > **AI models** picks the writing model and the image model for that run (kept when you run it again). **Generate more** has its own writing-model choice, and the **Image settings** button (quality and image model) applies to Generate image, Make again and Generate missing images. Only models listed in `app/server/models.js` can be used; change the lists with `CLAUDE_MODELS` / `IMAGE_MODELS` and the defaults with `CLAUDE_MODEL` / `IMAGE_MODEL` (comma separated ids, optionally `id:Label`). Cost estimates follow the model (the per-model Claude prices are assumptions; override with `PRICE_CLAUDE_BY_MODEL='{"claude-opus-5-5":[15,75]}'`).

**Hashtags on older runs:** runs made before tags existed show **Add hashtags** on each post and an **Add hashtags (N)** button at the top of the Static ads and Videos tabs. One click has Claude write 6 to 8 tags for every post that has none (about a cent; up to 20 posts at a time). Posts that already have tags are left alone.
