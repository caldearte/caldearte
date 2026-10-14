"use client";

import { useState } from "react";
import type { EventRecord } from "@/lib/events";
import { FAMILY_MODE_COOKIE, getCookie, setCookie } from "@/lib/cookies";
import Header from "./Header";
import MenuDrawer from "./MenuDrawer";
import SearchPanel from "./SearchPanel";

// The home's fixed top bar on the event page (Daniel, 2026-10-13): logo,
// search and menu, without the home's section links. The page itself is
// cache-eligible and ships no event list, so the search's events are
// fetched from /api/home-data the first time it opens (that route reads
// the visitor's cookies, family mode included); family mode is read from
// and written to its cookie here — nothing on this page filters by it.
// `bottomBorder` off where a sticky bar of the page's own sits right under
// it (the venue/artist page's title), so the two read as one block.
export default function EventPageHeader({ bottomBorder = true }: { bottomBorder?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchEvents, setSearchEvents] = useState<EventRecord[] | null>(null);
  const [familyMode, setFamilyMode] = useState(false);

  function openSearch() {
    setSearchOpen(true);
    if (searchEvents !== null) return;
    setSearchEvents([]);
    fetch("/api/home-data")
      .then((r) => (r.ok ? r.json() : null))
      .then((model: { searchableEvents?: EventRecord[] } | null) => setSearchEvents(model?.searchableEvents ?? []))
      .catch(() => setSearchEvents(null));
  }

  function openMenu() {
    setFamilyMode(getCookie(FAMILY_MODE_COOKIE) === "1");
    setMenuOpen(true);
  }

  function toggleFamilyMode() {
    setCookie(FAMILY_MODE_COOKIE, familyMode ? "" : "1");
    setFamilyMode(!familyMode);
  }

  return (
    <>
      <Header onOpenSearch={openSearch} onOpenMenu={openMenu} sectionNav={false} bottomBorder={bottomBorder} />
      <MenuDrawer open={menuOpen} familyMode={familyMode} onToggleFamilyMode={toggleFamilyMode} onClose={() => setMenuOpen(false)} />
      <SearchPanel open={searchOpen} events={searchEvents ?? []} onClose={() => setSearchOpen(false)} />
    </>
  );
}
