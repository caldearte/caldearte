// Thin wrapper around the 3-call Instagram Graph API carousel-publish
// flow (create each item -> create the carousel container from those
// item ids -> publish the container). Plain fetch, matching the rest of
// this package's style (lib/notify.ts's Resend/GitHub calls) rather than
// pulling in an SDK for 3 endpoints.
//
// graph.instagram.com, not graph.facebook.com — real bug, found
// 2026-08-23 testing against the real account: the app was set up via
// "Instagram API with Instagram Login" (the instagram.com/consent OAuth
// flow, not Facebook Login for Business), which issues "IGAA..."-prefixed
// tokens meant for Instagram's own Graph API host. Pointing those tokens
// at graph.facebook.com (the classic Facebook Graph API, for "EAA..."
// tokens from the Facebook Login flow) fails with a generic "Cannot parse
// access token" error that gives no hint the host itself is wrong.
const GRAPH_API_BASE = "https://graph.instagram.com/v21.0";

export interface InstagramClientConfig {
  igBusinessAccountId: string;
  accessToken: string;
}

async function graphPost(path: string, params: Record<string, string>): Promise<{ id: string }> {
  const url = new URL(`${GRAPH_API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url, { method: "POST" });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Instagram Graph API error on POST ${path}: ${JSON.stringify(body)}`);
  }
  return body as { id: string };
}

// Read-only sanity check — confirms the token/account id actually work
// (right permissions, not expired) without touching anything. Used by the
// dry-run path (RunDeps.dryRun in run.ts) so a manual test run gives real
// confidence the credentials work, not just that they're present.
export async function verifyInstagramAccount(config: InstagramClientConfig): Promise<{ username: string; mediaCount: number }> {
  const url = new URL(`${GRAPH_API_BASE}/${config.igBusinessAccountId}`);
  url.searchParams.set("fields", "username,media_count");
  url.searchParams.set("access_token", config.accessToken);
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(`Instagram Graph API error verifying account: ${JSON.stringify(body)}`);
  return { username: body.username, mediaCount: body.media_count };
}

const MEDIA_DOWNLOAD_RETRY_ATTEMPTS = 3;
const MEDIA_DOWNLOAD_RETRY_DELAY_MS = 5000;

// Real bug found 2026-08-23: a carousel item failed with code 9004
// ("Only photo or video can be accepted as media type" / "Media download
// has failed") on an image URL that had published fine one minute earlier
// in the very same run — Instagram fetches image_url itself, and that
// fetch is occasionally flaky on their end rather than a real problem
// with our image. Retrying just this error code (not e.g. auth or param
// errors, which won't fix themselves) turns a transient blip into a
// no-op instead of failing the whole carousel.
function isMediaDownloadError(message: string): boolean {
  return message.includes('"code":9004');
}

// Step 1 (per image): register one carousel item, returns its creation_id.
export async function createCarouselItem(
  config: InstagramClientConfig,
  imageUrl: string,
  retryDelayMs = MEDIA_DOWNLOAD_RETRY_DELAY_MS,
): Promise<string> {
  for (let attempt = 1; attempt <= MEDIA_DOWNLOAD_RETRY_ATTEMPTS; attempt++) {
    try {
      const { id } = await graphPost(`${config.igBusinessAccountId}/media`, {
        image_url: imageUrl,
        is_carousel_item: "true",
        access_token: config.accessToken,
      });
      return id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!isMediaDownloadError(message) || attempt === MEDIA_DOWNLOAD_RETRY_ATTEMPTS) throw err;
      await sleep(retryDelayMs);
    }
  }
  throw new Error("unreachable");
}

// Step 2: bundle the item creation_ids into one carousel container,
// returns ITS creation_id (not yet visible on the profile).
export async function createCarouselContainer(config: InstagramClientConfig, itemCreationIds: string[], caption: string): Promise<string> {
  const { id } = await graphPost(`${config.igBusinessAccountId}/media`, {
    media_type: "CAROUSEL",
    children: itemCreationIds.join(","),
    caption,
    access_token: config.accessToken,
  });
  return id;
}

// Step 3: publishes the container — this is the call that actually makes
// the post go live on the profile.
export async function publishCarousel(config: InstagramClientConfig, containerCreationId: string): Promise<string> {
  const { id } = await graphPost(`${config.igBusinessAccountId}/media_publish`, {
    creation_id: containerCreationId,
    access_token: config.accessToken,
  });
  return id;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CONTAINER_POLL_INTERVAL_MS = 3000;
const CONTAINER_POLL_MAX_ATTEMPTS = 30; // ~90s ceiling

// Real bug found 2026-08-23 publishing a real 10-image carousel
// (no_te_la_pierdas): media_publish failed with "Media ID is not
// available" / "The media is not ready for publishing" (code 9007,
// subcode 2207027) — Instagram processes each carousel item
// asynchronously after createCarouselContainer, and a bigger carousel can
// outrun a naive create-then-publish sequence. A 6-image carousel
// (inauguracion, published successfully earlier the same day) only
// worked because it happened to finish processing in time. Polling the
// container's own status_code until FINISHED (Meta's documented pattern
// for this) makes publishing reliable regardless of carousel size.
export async function waitUntilContainerReady(
  config: InstagramClientConfig,
  containerCreationId: string,
  pollIntervalMs = CONTAINER_POLL_INTERVAL_MS,
): Promise<void> {
  for (let attempt = 0; attempt < CONTAINER_POLL_MAX_ATTEMPTS; attempt++) {
    const url = new URL(`${GRAPH_API_BASE}/${containerCreationId}`);
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", config.accessToken);
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok) throw new Error(`Instagram Graph API error checking container status: ${JSON.stringify(body)}`);
    if (body.status_code === "FINISHED") return;
    if (body.status_code === "ERROR" || body.status_code === "EXPIRED") {
      throw new Error(`Instagram carousel container failed to process (status_code: ${body.status_code})`);
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`Instagram carousel container still not ready after ${CONTAINER_POLL_MAX_ATTEMPTS} status checks`);
}

// Full flow for one carousel post. Instagram creates each item
// sequentially server-side (it fetches image_url itself), so these run
// one at a time rather than in parallel — matches how the API is meant to
// be driven and keeps a failure on item N from firing extra requests for
// items after it.
export async function publishInstagramCarousel(
  config: InstagramClientConfig,
  imageUrls: string[],
  caption: string,
  pollIntervalMs = CONTAINER_POLL_INTERVAL_MS,
  mediaRetryDelayMs = MEDIA_DOWNLOAD_RETRY_DELAY_MS,
): Promise<string> {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error(`Instagram carousels need 2-10 images, got ${imageUrls.length}`);
  }
  const itemIds: string[] = [];
  for (const imageUrl of imageUrls) {
    itemIds.push(await createCarouselItem(config, imageUrl, mediaRetryDelayMs));
  }
  const containerId = await createCarouselContainer(config, itemIds, caption);
  await waitUntilContainerReady(config, containerId, pollIntervalMs);
  return publishCarousel(config, containerId);
}
