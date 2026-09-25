// Thin wrapper around the Facebook Page multi-photo post flow (upload
// each photo unpublished -> create one feed post that attaches all of
// them). Plain fetch, matching instagram.ts's style in this same
// directory rather than pulling in an SDK for 2 endpoints.
//
// graph.facebook.com, not graph.instagram.com — the Instagram client in
// this directory deliberately uses the Instagram-only host because its
// token comes from the Instagram Login flow (see instagram.ts's own
// comment). A Facebook Page token comes from the separate Facebook
// Login for Business flow and only works against this classic host.
const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

export interface FacebookClientConfig {
  pageId: string;
  accessToken: string;
}

async function graphPost(path: string, params: Record<string, string>): Promise<{ id: string }> {
  const url = new URL(`${GRAPH_API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url, { method: "POST" });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Facebook Graph API error on POST ${path}: ${JSON.stringify(body)}`);
  }
  return body as { id: string };
}

// Read-only sanity check — confirms the token/page id actually work
// before a run tries to publish with them. Mirrors
// instagram.ts's verifyInstagramAccount for the same dry-run purpose.
export async function verifyFacebookPage(config: FacebookClientConfig): Promise<{ name: string }> {
  const url = new URL(`${GRAPH_API_BASE}/${config.pageId}`);
  url.searchParams.set("fields", "name");
  url.searchParams.set("access_token", config.accessToken);
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(`Facebook Graph API error verifying page: ${JSON.stringify(body)}`);
  return { name: body.name };
}

// Step 1 (per image): upload a photo to the Page's library without
// publishing it, returns its id for attaching to a feed post below.
export async function uploadUnpublishedPhoto(config: FacebookClientConfig, imageUrl: string): Promise<string> {
  const { id } = await graphPost(`${config.pageId}/photos`, {
    url: imageUrl,
    published: "false",
    access_token: config.accessToken,
  });
  return id;
}

// Step 2: one feed post referencing every uploaded photo id — this is
// what actually goes live on the Page.
export async function createMultiPhotoPost(config: FacebookClientConfig, photoIds: string[], message: string): Promise<string> {
  const { id } = await graphPost(`${config.pageId}/feed`, {
    message,
    attached_media: JSON.stringify(photoIds.map((photoId) => ({ media_fbid: photoId }))),
    access_token: config.accessToken,
  });
  return id;
}

// Full flow for one multi-photo Page post. Facebook processes each
// upload synchronously (unlike Instagram's carousel, there's no
// container-ready polling step), so these can run in parallel.
export async function publishFacebookPost(config: FacebookClientConfig, imageUrls: string[], message: string): Promise<string> {
  const photoIds = await Promise.all(imageUrls.map((imageUrl) => uploadUnpublishedPhoto(config, imageUrl)));
  return createMultiPhotoPost(config, photoIds, message);
}
