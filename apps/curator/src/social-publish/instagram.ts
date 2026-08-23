// Thin wrapper around the 3-call Instagram Graph API carousel-publish
// flow (create each item -> create the carousel container from those
// item ids -> publish the container). Plain fetch, matching the rest of
// this package's style (lib/notify.ts's Resend/GitHub calls) rather than
// pulling in an SDK for 3 endpoints.
const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

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

// Step 1 (per image): register one carousel item, returns its creation_id.
export async function createCarouselItem(config: InstagramClientConfig, imageUrl: string): Promise<string> {
  const { id } = await graphPost(`${config.igBusinessAccountId}/media`, {
    image_url: imageUrl,
    is_carousel_item: "true",
    access_token: config.accessToken,
  });
  return id;
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

// Full flow for one carousel post. Instagram creates each item
// sequentially server-side (it fetches image_url itself), so these run
// one at a time rather than in parallel — matches how the API is meant to
// be driven and keeps a failure on item N from firing extra requests for
// items after it.
export async function publishInstagramCarousel(config: InstagramClientConfig, imageUrls: string[], caption: string): Promise<string> {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error(`Instagram carousels need 2-10 images, got ${imageUrls.length}`);
  }
  const itemIds: string[] = [];
  for (const imageUrl of imageUrls) {
    itemIds.push(await createCarouselItem(config, imageUrl));
  }
  const containerId = await createCarouselContainer(config, itemIds, caption);
  return publishCarousel(config, containerId);
}
