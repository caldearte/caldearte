import type { Metadata } from "next";
import { esCL } from "@/i18n/es-CL";
import CuratoriaContent from "@/components/CuratoriaContent";

export const metadata: Metadata = { title: `${esCL.curatoriaPage.title} — ${esCL.appName}` };

export default function CuratoriaPage() {
  return <CuratoriaContent />;
}
