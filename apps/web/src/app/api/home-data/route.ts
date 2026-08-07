import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { computeHomeViewModel } from "@/lib/homeViewModel";

// Client-side counterpart to page.tsx's cached default render (see that
// file's own comment, and homeViewModel.ts) — called by HomeClient.tsx
// only when the visitor's real cookies (city, family mode, filters) or
// URL params (?semana=, ?newsletter=) differ from the default the server
// already rendered. Freely reads real cookies()/headers() here — a JSON
// route handler doesn't need to be cache-eligible the way the page itself
// does; its response is small compared to a full HTML/RSC page payload.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cookieStore = await cookies();
  const headerStore = await headers();
  const model = await computeHomeViewModel({
    cookieStore,
    headerStore,
    semana: searchParams.get("semana") ?? undefined,
    newsletter: searchParams.get("newsletter") ?? undefined,
  });
  return NextResponse.json(model);
}
