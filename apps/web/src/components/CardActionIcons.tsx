// Shared icon glyphs for event-card action buttons/menus — used by
// EventCardBase (kebab menu + standalone buttons) and the redesign's
// bento/list card variants. None of these are pixel-exact brand assets,
// just plain-line icons in a consistent style.

export function DirectionsGlyph({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polyline points="15 14 20 9 15 4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20v-7a4 4 0 0 1 4-4h12" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// NOT the same asset as /icons/link-affordance.svg (designed for the
// card's own dark background) — this is for light backgrounds (menus,
// standalone buttons), where that asset would be invisible.
export function ExternalLinkGlyph({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="15 3 21 3 21 9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="10" y1="14" x2="21" y2="3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CalendarGlyph({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth="2" />
      <line x1="3" y1="10" x2="21" y2="10" stroke={color} strokeWidth="2" />
      <line x1="8" y1="3" x2="8" y2="7" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="3" x2="16" y2="7" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="13" x2="12" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="9.5" y1="15.5" x2="14.5" y2="15.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function WhatsAppGlyph({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.4A10 10 0 1 0 12 2z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M8.5 8.5c-.3 1 .1 2.2 1.3 3.6 1.2 1.4 2.5 2 3.6 2.2.8.1 1.4-.4 1.6-1l.2-.6c.1-.3 0-.6-.3-.8l-1.4-.9c-.3-.2-.6-.1-.8.1l-.4.5c-.6-.2-1.2-.6-1.7-1.2-.5-.6-.8-1.2-.9-1.8l.5-.4c.2-.2.3-.5.1-.8l-.9-1.5c-.2-.3-.5-.4-.8-.3l-.6.2z"
        fill={color}
      />
    </svg>
  );
}

export function XGlyph({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="4" y1="4" x2="20" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="20" y1="4" x2="4" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function FacebookGlyph({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <path d="M13.5 9h1.5V6.5h-1.8c-1.6 0-2.7 1-2.7 2.7V11H9v2.5h1.5V18h2.5v-4.5h1.7l.3-2.5h-2V9.4c0-.3.1-.4.4-.4z" fill={color} />
    </svg>
  );
}

// Generic fallback for Instagram/TikTok/email/anywhere else with no
// direct web share-intent URL.
export function CopyGlyph({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" stroke={color} strokeWidth="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export function ShareGlyph({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="18" cy="5" r="3" stroke={color} strokeWidth="2" />
      <circle cx="6" cy="12" r="3" stroke={color} strokeWidth="2" />
      <circle cx="18" cy="19" r="3" stroke={color} strokeWidth="2" />
      <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" stroke={color} strokeWidth="2" />
      <line x1="8.6" y1="13.4" x2="15.4" y2="17.6" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export function BackArrowGlyph({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function KebabGlyph({ color = "white" }: { color?: string }) {
  return (
    <svg width="4" height="16" viewBox="0 0 4 16" fill={color} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="2" cy="2" r="1.7" />
      <circle cx="2" cy="8" r="1.7" />
      <circle cx="2" cy="14" r="1.7" />
    </svg>
  );
}
