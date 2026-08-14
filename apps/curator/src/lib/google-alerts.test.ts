import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGoogleAlertFeed } from "./google-alerts.js";

// Real captured shape from the actual "inauguracion de arte" feed
// (2026-08-14) — trimmed to 2 entries. Confirms the double-decode (XML
// entities wrapping HTML entities) and the Google-redirect URL unwrap
// both work against real data, not an idealized fixture.
const REAL_FEED_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Google Alert - inauguracion de arte</title>
<entry>
<id>tag:google.com,2013:googlealerts/feed:6225395255318560712</id>
<title type="html">Exposición &#8220;Estación Umbría&#8221; lleva el bosque milenario de La Araucanía hasta la UCT</title>
<link href="https://www.google.com/url?rct=j&amp;sa=t&amp;url=https://www.uct.cl/actualidad/noticias/exposicion-estacion-umbria-lleva-el-bosque-milenario-de-la-araucania-hasta-la-uct/&amp;ct=ga&amp;cd=CAIyG2M0MzNmZjQ0MmM1MDE0YTI6Y2w6ZXM6Q0w6Ug&amp;usg=AOvVaw3wcEi9OlZbOl6AHMZtrbhk"></link>
<published>2026-08-14T03:38:02Z</published>
<updated>2026-08-14T03:38:02Z</updated>
<content type="html">Carolina Acuña, egresada de &lt;b&gt;Artes&lt;/b&gt; Visuales con especialidad en Grabado y Magíster por la Universidad de Chile, se ha dedicado desde el término de sus&amp;nbsp;...</content>
<author><name></name></author>
</entry>
<entry>
<id>tag:google.com,2013:googlealerts/feed:8532791600382714793</id>
<title type="html">ArtePuerto 2026 reúne a 34 artistas en exposición gratuita en Valparaíso - El Martutino</title>
<link href="https://www.google.com/url?rct=j&amp;sa=t&amp;url=https://www.elmartutino.cl/noticia/cultura/artepuerto-2026-reune-34-artistas-en-exposicion-gratuita-en-valparaiso&amp;ct=ga&amp;cd=CAIyG2M0MzNmZjQ0MmM1MDE0YTI6Y2w6ZXM6Q0w6Ug&amp;usg=AOvVaw2QWJRH6u9LpTtUag1KA0SX"></link>
<published>2026-08-14T03:37:25Z</published>
<updated>2026-08-14T03:37:25Z</updated>
<content type="html">La &lt;b&gt;inauguración&lt;/b&gt; reunió a gran parte de los artistas participantes ... &lt;b&gt;arte&lt;/b&gt;. &#8220;Una exposición colectiva&amp;nbsp;...</content>
<author><name></name></author>
</entry>
</feed>`;

test("parseGoogleAlertFeed unwraps the real article URL from Google's redirect link", () => {
  const [first] = parseGoogleAlertFeed(REAL_FEED_SAMPLE);
  assert.equal(
    first.url,
    "https://www.uct.cl/actualidad/noticias/exposicion-estacion-umbria-lleva-el-bosque-milenario-de-la-araucania-hasta-la-uct/",
  );
});

test("parseGoogleAlertFeed decodes numeric HTML entities in the title", () => {
  const [first] = parseGoogleAlertFeed(REAL_FEED_SAMPLE);
  assert.equal(first.title, "Exposición “Estación Umbría” lleva el bosque milenario de La Araucanía hasta la UCT");
});

test("parseGoogleAlertFeed strips the <b> keyword-highlight tags and decodes the double-escaped entities inside the snippet", () => {
  const [first] = parseGoogleAlertFeed(REAL_FEED_SAMPLE);
  assert.equal(first.snippet, "Carolina Acuña, egresada de Artes Visuales con especialidad en Grabado y Magíster por la Universidad de Chile, se ha dedicado desde el término de sus ...");
  assert.doesNotMatch(first.snippet, /[<>]/);
});

test("parseGoogleAlertFeed reads publishedDate as a plain YYYY-MM-DD, dropping the time", () => {
  const [first] = parseGoogleAlertFeed(REAL_FEED_SAMPLE);
  assert.equal(first.publishedDate, "2026-08-14");
});

test("parseGoogleAlertFeed returns one entry per <entry> block, in document order", () => {
  const entries = parseGoogleAlertFeed(REAL_FEED_SAMPLE);
  assert.equal(entries.length, 2);
  assert.match(entries[1].title, /ArtePuerto 2026/);
});

test("parseGoogleAlertFeed handles an empty feed", () => {
  assert.deepEqual(parseGoogleAlertFeed('<?xml version="1.0"?><feed></feed>'), []);
});

test("parseGoogleAlertFeed skips a malformed entry missing a required field, without throwing", () => {
  const malformed = `<feed><entry><title>Sin link ni fecha</title></entry></feed>`;
  assert.deepEqual(parseGoogleAlertFeed(malformed), []);
});
