"use client";

import { useCallback, useState } from "react";
import { FAMILY_MODE_COOKIE, setCookie } from "@/lib/cookies";
import { familyModeOn, useSearchShortcut } from "@/lib/useSearchIndex";
import Header from "./Header";
import MenuDrawer from "./MenuDrawer";
import SearchPanel from "./SearchPanel";

// The home's fixed top bar on pages other than the home (the ficha, venue
// and artist pages; Daniel, 2026-10-13): logo, search and menu, without
// the home's section links. These pages are cache-eligible and read no
// cookies; the search loads its own index when opened (useSearchIndex),
// and family mode is read from and written to its cookie here, with the
// home's default (on unless the cookie says otherwise) — nothing on these
// pages filters by it.
// `bottomBorder` off where a sticky bar of the page's own sits right under
// it (the venue/artist page's title), so the two read as one block.
export default function EventPageHeader({ bottomBorder = true }: { bottomBorder?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [familyMode, setFamilyMode] = useState(true);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useSearchShortcut(openSearch);

  function openMenu() {
    setFamilyMode(familyModeOn());
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
      <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
