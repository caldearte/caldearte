// Shared "boxed" status-message style (success/error) used by every form
// on the redesigned site — full-width, generous padding, a thick border
// colored by outcome, uppercase text — first built for NewsletterSection,
// now reused by DrawerContactForm too. `textColorClass` is the caller's
// job since the same box needs dark text on a light bg (newsletter
// section) and light text on a dark bg (the menu drawer's contact form).
export function statusBoxClass(outcome: "success" | "error", textColorClass: string): string {
  const border = outcome === "success" ? "border-green-600" : "border-red-600";
  return `w-full text-left uppercase border-4 md:border-6 px-[16px] md:px-[21px] py-[16px] md:py-[20px] font-lato font-semibold text-[16px] md:text-[20px] ${textColorClass} ${border}`;
}
