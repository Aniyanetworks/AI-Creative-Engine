// Meta (Facebook / Instagram / Ads) through the Graph API, using the signed-in person's OWN connected account.
// Each person connects with Facebook Login; their (long-lived) token is stored encrypted per account (see secrets.js, store.js).
// Nothing here runs by itself: every call is made when someone confirms a post in the app.
//
// Safe defaults: ads are always created PAUSED; Facebook Page posts default to an unpublished draft; Instagram has no draft,
// so it only publishes after an explicit confirmation. Netlify functions stop after about 10 seconds, so every call here is
// one small step and the page drives the steps one by one (see the /post routes in index.js).

export const SCOPES = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish', 'ads_management', 'ads_read', 'business_management'];

// Our call-to-action wording -> Meta's call_to_action types ("Book Now" has no general Meta equivalent, so it becomes Learn More).
export const CTA_TYPES = { 'Learn More': 'LEARN_MORE', 'Sign Up': 'SIGN_UP', 'Book Now': 'LEARN_MORE', 'Contact Us': 'CONTACT_US', 'Get Quote': 'GET_QUOTE', 'Apply Now': 'APPLY_NOW', Download: 'DOWNLOAD', 'Shop Now': 'SHOP_NOW' };

export function createMeta({ appId, appSecret, configId = '', version = 'v21.0', graphBase = 'https://graph.facebook.com', dialogBase = 'https://www.facebook.com', fetchImpl = fetch }) {
  const configured = !!(appId && appSecret);
  const base = graphBase.replace(/\/+$/, '') + '/' + version;

  async function g(method, path, params = {}, token) {
    const url = new URL(base + path);
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
      if (method === 'GET') url.searchParams.set(k, val); else body.set(k, val);
    }
    if (token) { if (method === 'GET') url.searchParams.set('access_token', token); else body.set('access_token', token); }
    const r = await fetchImpl(url.toString(), { method, body: method === 'GET' ? undefined : body, headers: method === 'GET' ? undefined : { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(9000) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.error) {
      const e = (j && j.error) || {};
      const msg = e.error_user_msg || e.message || 'HTTP ' + r.status;
      throw Object.assign(new Error('Meta: ' + msg + (e.code ? ' (code ' + e.code + ')' : '')), { status: r.status >= 500 ? 502 : 400, metaCode: e.code });
    }
    return j;
  }

  return {
    configured,

    authUrl(state, redirectUri) {
      const u = new URL(dialogBase.replace(/\/+$/, '') + '/' + version + '/dialog/oauth');
      u.searchParams.set('client_id', appId); u.searchParams.set('redirect_uri', redirectUri); u.searchParams.set('state', state);
      u.searchParams.set('response_type', 'code');
      // Apps that use "Facebook Login for Business" log in with a Configuration (its permissions are chosen in the Meta dashboard);
      // classic apps pass the permissions as a scope.
      if (configId) { u.searchParams.set('config_id', configId); u.searchParams.set('override_default_response_type', 'true'); }
      else u.searchParams.set('scope', SCOPES.join(','));
      return u.toString();
    },

    // code -> short-lived user token -> long-lived token (about 60 days)
    async exchange(code, redirectUri) {
      const short = await g('GET', '/oauth/access_token', { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code });
      const long = await g('GET', '/oauth/access_token', { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token });
      return { token: long.access_token, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null };
    },

    // What this person can post to: Pages (with their own tokens and linked Instagram accounts) and ad accounts.
    async assets(userToken) {
      const me = await g('GET', '/me', { fields: 'id,name' }, userToken);
      const pages = await g('GET', '/me/accounts', { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: 100 }, userToken).catch(() => ({ data: [] }));
      const ads = await g('GET', '/me/adaccounts', { fields: 'id,account_id,name,currency,account_status', limit: 100 }, userToken).catch(() => ({ data: [] }));
      return {
        me: { id: me.id, name: me.name },
        pages: (pages.data || []).map((p) => ({ id: p.id, name: p.name, token: p.access_token, ig: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username } : null })),
        adAccounts: (ads.data || []).map((a) => ({ id: a.account_id || String(a.id).replace(/^act_/, ''), name: a.name, currency: a.currency, active: a.account_status === 1 })),
      };
    },

    // Facebook Page photo post. mode: 'draft' (unpublished, shows in Publishing tools), 'now', or 'schedule' (with scheduleAt, a Date or ISO string).
    async postFacebook({ pageId, pageToken, imageUrl, caption, mode = 'draft', scheduleAt }) {
      const params = { url: imageUrl, caption };
      if (mode === 'now') params.published = true;
      else if (mode === 'schedule') {
        const t = Math.floor(new Date(scheduleAt).getTime() / 1000);
        if (!Number.isFinite(t) || t < Date.now() / 1000 + 10 * 60 || t > Date.now() / 1000 + 75 * 86400) throw Object.assign(new Error('Pick a time between 10 minutes and 75 days from now.'), { status: 400 });
        params.published = false; params.scheduled_publish_time = t;
      } else params.published = false;
      const r = await g('POST', '/' + encodeURIComponent(pageId) + '/photos', params, pageToken);
      return { id: r.post_id || r.id, photoId: r.id, status: mode === 'now' ? 'published' : mode === 'schedule' ? 'scheduled' : 'draft' };
    },

    // Instagram image post (story = true makes a Story). No draft exists, so this publishes. Two quick calls; the container is
    // checked once before publishing and, if Instagram is still working on it, the caller can retry publishInstagram().
    async postInstagram({ igId, pageToken, imageUrl, caption, story }) {
      const c = await g('POST', '/' + encodeURIComponent(igId) + '/media', story ? { image_url: imageUrl, media_type: 'STORIES' } : { image_url: imageUrl, caption }, pageToken);
      return this.publishInstagram({ igId, pageToken, creationId: c.id });
    },
    async publishInstagram({ igId, pageToken, creationId }) {
      let st = null;
      try { st = (await g('GET', '/' + encodeURIComponent(creationId), { fields: 'status_code' }, pageToken)).status_code; } catch { /* publish anyway */ }
      if (st && st !== 'FINISHED' && st !== 'PUBLISHED') {
        if (st === 'ERROR' || st === 'EXPIRED') throw Object.assign(new Error('Instagram could not process the image (' + st + ').'), { status: 400 });
        return { creationId, status: 'processing' };
      }
      const p = await g('POST', '/' + encodeURIComponent(igId) + '/media_publish', { creation_id: creationId }, pageToken);
      return { id: p.id, creationId, status: 'published' };
    },

    // Paid ads, always PAUSED. Step 1: a campaign and an ad set. Step 2 (per ad): a creative and the ad.
    async createCampaign({ adAccountId, token, name, dailyBudgetCents, countries = ['CA'], ageMin = 18, ageMax = 65 }) {
      const act = '/act_' + String(adAccountId).replace(/^act_/, '');
      const campaign = await g('POST', act + '/campaigns', { name, objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: [] }, token);
      const adSet = await g('POST', act + '/adsets', {
        name: name + ' - ad set', campaign_id: campaign.id, daily_budget: Math.max(100, Math.round(dailyBudgetCents)), billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP', destination_type: 'WEBSITE', status: 'PAUSED',
        targeting: { geo_locations: { countries }, age_min: ageMin, age_max: ageMax },
      }, token);
      return { campaignId: campaign.id, adSetId: adSet.id };
    },
    async createAd({ adAccountId, token, pageId, adSetId, name, link, imageUrl, message, headline, description, cta }) {
      const act = '/act_' + String(adAccountId).replace(/^act_/, '');
      const creative = await g('POST', act + '/adcreatives', {
        name,
        object_story_spec: { page_id: pageId, link_data: { link, message, name: headline, description, picture: imageUrl, call_to_action: { type: CTA_TYPES[cta] || 'LEARN_MORE', value: { link } } } },
      }, token);
      const ad = await g('POST', act + '/ads', { name, adset_id: adSetId, creative: { creative_id: creative.id }, status: 'PAUSED' }, token);
      return { adId: ad.id, creativeId: creative.id };
    },
  };
}

// The caption for a post: the ad text, its hashtags and, for Facebook, the link.
export function captionFor(s, { link, maxTags = 30, max = 2200, withLink = false } = {}) {
  const tags = (s.hashtags || []).slice(0, maxTags).join(' ');
  const parts = [String(s.primary_text || '').trim()];
  if (withLink && link) parts.push(link);
  if (tags) parts.push(tags);
  return parts.filter(Boolean).join('\n\n').slice(0, max);
}

// Adds tracking parameters so results can be told apart in analytics.
export function withUtm(url, { campaign, content, source = 'meta', medium = 'paid_social' }) {
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', source); u.searchParams.set('utm_medium', medium);
    if (campaign) u.searchParams.set('utm_campaign', campaign);
    if (content) u.searchParams.set('utm_content', content);
    return u.toString();
  } catch { return url; }
}
