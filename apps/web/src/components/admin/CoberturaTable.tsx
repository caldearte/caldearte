"use client";

interface RunSummaryRow {
  entrypoint: "event_discovery" | "headless" | "instagram" | "google_alerts";
  startedAt: string;
  candidatesTotal: number;
  approvedByCuration: number;
  rejectedByCuration: number;
  insertedCount: number;
  replacedCount: number;
  duplicateSkippedCount: number;
  escalatedCount: number;
  expiredCount: number;
  insertFailedCount: number;
  costUsd: number;
}

const ENTRYPOINT_LABELS: Record<RunSummaryRow["entrypoint"], string> = {
  event_discovery: "Event Discovery (comunas + web)",
  headless: "MAVI (headless)",
  instagram: "Instagram",
  google_alerts: "Google Alerts",
};

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// "Cobertura" real por corrida — real gap found 2026-08-17, auditing a
// week of rejections: the only way to see this (candidatos curados, y el
// embudo real de qué pasó después de la curación — no solo aprobado/
// rechazado, sino insertado/reemplazado/duplicado/escalado/expirado/
// fallido) era revisar los logs crudos de GitHub Actions a mano. Esta
// data ya se calculaba en cada corrida (notify.ts), solo alimentaba un
// email cuyo envío real nunca se conectó — ahora queda guardada siempre
// (run-summary-store.ts), últimos 90 días, la más reciente primero.
export default function CoberturaTable({ runs }: { runs: RunSummaryRow[] }) {
  if (runs.length === 0) {
    return <p className="font-geist text-[14px] text-text-primary/70">Sin corridas registradas todavía.</p>;
  }

  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[320px]">
      <table className="w-full font-geist text-[13px] text-text-primary border-collapse">
        <thead className="sticky top-0 bg-surface-sage">
          <tr className="border-b border-text-primary/20 text-left">
            <th className="py-2 pr-4">Fuente</th>
            <th className="py-2 pr-4">Corrida</th>
            <th className="py-2 pr-4 text-right">Candidatos</th>
            <th className="py-2 pr-4 text-right">Aprobados</th>
            <th className="py-2 pr-4 text-right">Rechazados</th>
            <th className="py-2 pr-4 text-right">Insertados</th>
            <th className="py-2 pr-4 text-right">Reemplazados</th>
            <th className="py-2 pr-4 text-right">Duplicados</th>
            <th className="py-2 pr-4 text-right">Escalados</th>
            <th className="py-2 pr-4 text-right">Expirados</th>
            <th className="py-2 pr-4 text-right">Fallidos</th>
            <th className="py-2 pr-4 text-right">Costo</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run, i) => (
            <tr key={`${run.entrypoint}-${run.startedAt}-${i}`} className="border-b border-text-primary/10 hover:bg-surface-white">
              <td className="py-2 pr-4">{ENTRYPOINT_LABELS[run.entrypoint]}</td>
              <td className="py-2 pr-4 whitespace-nowrap">{formatDate(run.startedAt)}</td>
              <td className="py-2 pr-4 text-right">{run.candidatesTotal}</td>
              <td className="py-2 pr-4 text-right">{run.approvedByCuration}</td>
              <td className="py-2 pr-4 text-right">{run.rejectedByCuration}</td>
              <td className="py-2 pr-4 text-right">{run.insertedCount}</td>
              <td className="py-2 pr-4 text-right">{run.replacedCount}</td>
              <td className="py-2 pr-4 text-right">{run.duplicateSkippedCount}</td>
              <td className="py-2 pr-4 text-right">{run.escalatedCount}</td>
              <td className="py-2 pr-4 text-right">{run.expiredCount}</td>
              <td className="py-2 pr-4 text-right">{run.insertFailedCount}</td>
              <td className="py-2 pr-4 text-right">{formatUsd(run.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
