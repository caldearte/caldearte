// One-off manual post — NOT part of the daily cron. Used once, 2026-09-25,
// to publish Caldearte's "estamos de vuelta" announcement on the
// long-dormant Facebook Page, isolated from run.ts's event-selection and
// de-dup logic so testing the new Facebook connection couldn't risk a
// second, unwanted Instagram carousel going out the same day.
import { publishFacebookPost, type FacebookClientConfig } from "./facebook.js";

const CAPTION =
  "Estamos de vuelta en Facebook 🎨 A partir de ahora compartimos aquí la misma agenda de inauguraciones y visitas guiadas de arte en Chile — Santiago y regiones.";
const IMAGE_URL = "https://www.caldearte.com/social/ig-post-cierre.png";

async function main() {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !accessToken) throw new Error("FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN must be set.");
  const config: FacebookClientConfig = { pageId, accessToken };

  const postId = await publishFacebookPost(config, [IMAGE_URL], CAPTION);
  console.log(`[publish-once] published to Facebook, post id ${postId}.`);
}

main().catch((err) => {
  console.error(`[publish-once] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
