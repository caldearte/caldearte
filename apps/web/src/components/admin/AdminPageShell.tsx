import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import AdminMenu from "./AdminMenu";

// Shared by every /admin/* page. "Inicio" lives directly in the top bar
// (not inside the hamburger drawer) per Daniel's explicit request
// (2026-08-16) — he expected it there next to the menu icon, not buried
// in a drawer tap. The drawer (AdminMenu) now only holds cross-page nav
// (Costos, etc.) and Cerrar sesión.
export default function AdminPageShell({
  children,
  error,
  title = "Métricas — admin",
}: {
  children?: React.ReactNode;
  error?: string;
  title?: string;
}) {
  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-lato font-black leading-none text-brand-magenta text-[28px]">{title}</h1>
        <div className="flex items-center gap-6">
          <Link href="/" className="font-fragment-mono uppercase text-[14px] text-text-primary">
            {esCL.adminMenu.home}
          </Link>
          <AdminMenu />
        </div>
      </div>
      {error ? <p className="font-geist text-[16px] text-red-700">{error}</p> : children}
    </main>
  );
}
