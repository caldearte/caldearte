import { Resend } from "resend";
import { fetchApprovedEvents } from "./events";
import { todayInSantiago } from "./date";
import { buildWelcomeEmail, selectWelcomeOpenings } from "./welcomeEmail";

export interface WelcomeRecipient {
  email: string;
  adminRegionName: string;
  // The subscriber's confirm_token, which doubles as the unsubscribe token.
  token: string;
}

// Best effort: the subscription is already confirmed when this runs, so a
// failure here is logged and swallowed — the subscriber still lands on the
// "confirmed" modal and still gets Thursday's edition. A failed events
// fetch only drops the openings list, not the email.
export async function sendWelcomeEmail(recipient: WelcomeRecipient): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[newsletter/welcome] RESEND_API_KEY not set — skipping welcome email");
    return;
  }

  const todayStr = todayInSantiago();
  let openings: ReturnType<typeof selectWelcomeOpenings> = [];
  try {
    const { events, regions } = await fetchApprovedEvents();
    openings = selectWelcomeOpenings(events, regions, recipient.adminRegionName, todayStr);
  } catch (err) {
    console.error("[newsletter/welcome] events fetch failed, sending without openings", err);
  }

  const welcome = buildWelcomeEmail({ adminRegionName: recipient.adminRegionName, unsubscribeToken: recipient.token, openings, todayStr });

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: "Caldearte <contacto@caldearte.com>",
      to: recipient.email,
      subject: welcome.subject,
      text: welcome.text,
      html: welcome.html,
      headers: { "List-Unsubscribe": `<${welcome.unsubscribeUrl}>` },
    });
    if (error) console.error("[newsletter/welcome] send failed", error);
  } catch (err) {
    console.error("[newsletter/welcome] send threw", err);
  }
}
