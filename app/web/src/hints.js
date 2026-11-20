// Short, plain-language hints for every feature. Each is shown by a small "?" button (see components/Hint.jsx) and can be
// switched off in the Guide. Keep them to one or two sentences: what it does, and what it costs or risks when that matters.
export const HINTS = {
  // New run
  'run.modes': { title: 'How much to generate', text: 'Dry run writes the brief, hooks, ad copy and video scripts for a few cents and makes no pictures. Image test adds one picture so you can judge quality. Full run makes every image and renders the videos, so it costs the most.' },
  'run.models': { title: 'AI models', text: 'The writing model drafts the brief, hooks, ads and scripts. The image model draws the pictures. Bigger models write sharper copy but cost more and take longer. You can change the image model and quality again later, per image.' },

  // Run page
  'run.cost': { title: 'Estimated cost', text: 'What this run has cost so far at list prices: writing, images and voiceover. It is an estimate, not a bill. Click it for the breakdown.' },

  // Tabs
  'tab.Hooks': { title: 'Hooks', text: 'Opening lines for ads, each with its angle. Copy one, rewrite one with a short instruction, or generate more. Rewriting keeps its number.' },
  'tab.Static ads': { title: 'Static ads', text: 'Image ads in feed (square) and story (tall) shapes. Generate image makes the real picture and saves it to Drive; Options sets the model and quality. Generate missing, Add hashtags and Generate more work on the whole set; Rewrite improves one ad. Tick ads and press Post to send them to Meta. Green chips show where an ad was already posted.' },
  'tab.Videos': { title: 'Videos', text: 'Short vertical video ads, each with a storyboard and voiceover script. Pick a voice, tick the videos you want, and Render online (about 5 to 8 minutes, roughly 500 voice credits per video). Save to Google Drive copies finished videos without rendering again.' },
  'tab.Brief': { title: 'Brief', text: 'What the app understood about the business: what they do, who they sell to, proof it found on the site, and claims to check with the client before running ads.' },
  'tab.Competitors': { title: 'Competitors', text: 'Two views. By area researches real local competitors city by city (with source links). Market overview is the general analysis from the first run: overused angles and the gaps your ads can take.' },
  'comp.area': { title: 'Area-wise research', text: 'Type a city or region and the app searches the web for businesses competing there: what they offer and say, their strengths and gaps, and angles you can own. Add several areas to compare. It costs roughly 10 to 20 cents per area. Always check the source links before using a claim.' },
  'tab.Report': { title: 'Report', text: 'Everything in one document. It is also saved to your Google Drive folder. Use Copy or Download to share it.' },
  'tab.Usage': { title: 'Usage', text: 'Every charge for this run in time order: writing tokens, images and video renders, with the model used and the estimated cost.' },

  // Static ads

  // Videos
  'video.render': { title: 'Render videos online', text: 'GitHub renders the videos with a voiceover and brand-coloured captions in about 5 to 8 minutes. It uses voiceover credits (roughly 500 per video). Nothing runs on your computer.' },

  // Writing tools

  // Posting
  'post.where': { title: 'Where to post', text: 'Meta ads creates paused ads in your ad account. Facebook Page post saves a draft, schedules, or publishes to a Page. Instagram publishes straight away. Only paused ads and drafts are kept private.' },

  // Account, usage, admin
  'account.connected': { title: 'Connected accounts', text: 'Connect your own Facebook account to post from here. Each person connects their own, and nobody else can post with yours.' },
  'usage.page': { title: 'Usage and cost', text: 'Estimated spend by account, by day and by run (writing, images, voiceover). Estimates use list prices that you can change in the server settings. Admins see everyone; members see only their own.' },
};
