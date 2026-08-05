import type { Metadata } from "next";
import { esCL } from "@/i18n/es-CL";
import PrivacidadContent from "@/components/PrivacidadContent";

export const metadata: Metadata = { title: `${esCL.privacidad.title} — ${esCL.appName}` };

export default function PrivacidadPage() {
  return <PrivacidadContent />;
}
