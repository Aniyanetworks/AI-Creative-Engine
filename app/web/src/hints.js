// Short, plain-language hints for every feature. Each is shown by a small "?" button (see components/Hint.jsx) and can be
// switched off in the Guide. Keep them to one or two sentences: what it does, and what it costs or risks when that matters.
export const HINTS = {
  // New run
  'run.modes': { title: 'How much to generate', text: 'Dry run writes the brief, hooks, ad copy and video scripts for a few cents and makes no pictures. Image test adds one picture so you can judge quality. Full run makes every image and renders the videos, so it costs the most.' },
  'run.models': { title: 'AI models', text: 'The writing model drafts the brief, hooks, ads and scripts. The image model draws the pictures. Bigger models write sharper copy but cost more and take longer. You can change the image model and quality again later, per image.' },
  'run.notes': { title: 'Competitor notes', text: 'Optional. Paste what you already know about competitors (their offers, claims, ad angles). The writing model uses it to find gaps.' },

  // Run page
  'run.steps': { title: 'Progress', text: 'Each step is one stage of the pipeline. Steps marked skipped were not needed for this run, for example images on a dry run. You can leave the page: the run keeps going and is saved.' },
  'run.cost': { title: 'Estimated cost', text: 'What this run has cost so far at list prices: writing, images and voiceover. It is an estimate, not a bill. Click it for the breakdown.' },
  'run.again': { title: 'Run again', text: 'Starts a new run for the same website with the same settings. The old run stays untouched.' },

  // Tabs
  'tab.Hooks': { title: 'Hooks', text: 'Opening lines for ads, each with its angle. Copy one, rewrite one with a short instruction, or generate more. Rewriting keeps its number.' },
  'tab.Static ads': { title: 'Static ads', text: 'Image ads in feed (square) and story (tall) shapes. Concept previews show the planned text; Generate image makes the real picture and saves it to Drive. Select ads to post them to Meta.' },
  'tab.Videos': { title: 'Videos', text: 'Short vertical video ads. Each has a storyboard and a voiceover script. Render online turns them into MP4s with a voice. Rendering uses voiceover credits, so choose the voice first.' },
  'tab.Brief': { title: 'Brief', text: 'What the app understood about the business: what they do, who they sell to, proof it found on the site, and claims to check with the client before running ads.' },
  'tab.Competitors': { title: 'Competitors', text: 'The competitor analysis: what others are saying, the angles that are overused, and the gaps ("white space") your ads can take.' },
  'tab.Report': { title: 'Report', text: 'Everything in one document. It is also saved to your Google Drive folder. Use Copy or Download to share it.' },
  'tab.Usage': { title: 'Usage', text: 'Every charge for this run in time order: writing tokens, images and video renders, with the model used and the estimated cost.' },

  // Static ads
  'static.filters': { title: 'Filters', text: 'Feed is square, Stories is tall (9:16). Status shows which ads already have a real image, which are still concepts, and which failed.' },
  'static.progress': { title: 'Images made', text: 'Concept previews show the overlay text in your brand colour. Once you generate an image it is saved in your Drive folder and shown here.' },
  'static.settings': { title: 'Model & quality', text: 'Draft is quick and cheap, High has the sharpest text and detail. The image model changes the style and price. This applies to Generate image, Make again and Generate missing.' },
  'static.missing': { title: 'Generate missing', text: 'Makes an image for every ad that does not have one, a few seconds apart. You see the estimated cost and confirm first.' },
  'static.select': { title: 'Select ads', text: 'Tick ads (or select all with images), then use Post to send them to Facebook, Instagram or Meta Ads. Nothing is posted until you confirm.' },
  'static.tags': { title: 'Add hashtags', text: 'Writes 6 to 8 hashtags for every ad that has none. Ads that already have tags are left alone.' },
  'card.actions': { title: 'On each ad', text: 'Model & quality: choose how this picture is made. Generate image / Make again: make it (about 4 cents at standard quality; Make again lets you say what to change). Open in Drive: see the saved file. Copy ad: copies text, link and hashtags. Rewrite: improve this ad with AI.' },
  'card.platforms': { title: 'Where it can run', text: 'The chip shows the ad shape. The icons show the platforms and placements that shape fits. Hover an icon for the exact placements.' },
  'card.posted': { title: 'Posted', text: 'Green chips show where this ad was already sent from this app, for example a Facebook draft or a paused Meta ad.' },

  // Videos
  'video.render': { title: 'Render videos online', text: 'GitHub renders the videos with a voiceover and brand-coloured captions in about 5 to 8 minutes. It uses voiceover credits (roughly 500 per video). Nothing runs on your computer.' },
  'video.voice': { title: 'Voiceover voice', text: 'Pick the voice that reads the script. Choose Other to paste any voice id from your voice library. The choice is remembered.' },
  'video.pick': { title: 'Render only some', text: 'Tick the videos you want. Videos you leave unticked keep their earlier files.' },
  'video.drive': { title: 'Save to Google Drive', text: 'Copies the finished videos to Drive without rendering again, so it costs nothing. Each video then shows Open in Drive.' },

  // Writing tools
  'write.more': { title: 'Generate more', text: 'Choose how many, add an optional focus, and pick the writing model. It takes about half a minute and you can keep working.' },
  'write.rewrite': { title: 'Rewrite', text: 'Asks the writing model to improve this item. Say what should change, or leave it blank for a sharper version. Its number stays the same, and an old picture or video is marked out of date.' },

  // Posting
  'post.where': { title: 'Where to post', text: 'Meta ads creates paused ads in your ad account. Facebook Page post saves a draft, schedules, or publishes to a Page. Instagram publishes straight away. Only paused ads and drafts are kept private.' },
  'post.when': { title: 'Draft, schedule or publish', text: 'Draft saves the post unpublished in your Page tools. Schedule publishes at the time you choose. Publish now makes it public immediately and needs an extra tick.' },
  'post.ads': { title: 'Paused ads', text: 'Creates a campaign, an ad set and one ad per selected ad, all paused. Budget and audience are only used once you switch the campaign on in Meta Ads Manager.' },
  'post.link': { title: 'Website link', text: 'Where people land when they click. Tracking tags (utm) are added so you can tell which ad worked.' },
  'post.connect': { title: 'Connect Facebook', text: 'You sign in at Facebook and choose which Pages and ad accounts this app may use. It posts as you, only when you confirm, and you can disconnect any time.' },

  // Account, usage, admin
  'account.connected': { title: 'Connected accounts', text: 'Connect your own Facebook account to post from here. Each person connects their own, and nobody else can post with yours.' },
  'usage.page': { title: 'Usage and cost', text: 'Estimated spend by account, by day and by run (writing, images, voiceover). Estimates use list prices that you can change in the server settings. Admins see everyone; members see only their own.' },
  'users.page': { title: 'Users', text: 'People can sign up, but cannot run anything until an admin approves them, because every run spends your API credits.' },
};
