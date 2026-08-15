"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface WeekMetric {
  week: string;
  inauguraciones: number;
  expos: number;
}

// Client component — recharts renders via the DOM/SVG, needs the browser.
// Simple stacked-ish bar chart (two series side by side), no custom theme
// system in this codebase to plug into — inline hex matching the site's
// own brand colors (brand-magenta / a muted sage-adjacent tone) rather
// than inventing a new palette.
export default function EventMetricsChart({ data }: { data: WeekMetric[] }) {
  if (data.length === 0) {
    return <p className="font-geist text-[14px] text-text-primary/70">Sin eventos en la ventana seleccionada.</p>;
  }

  return (
    <div className="w-full h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#00000015" />
          <XAxis dataKey="week" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="inauguraciones" name="Inauguraciones" fill="#ff00fb" />
          <Bar dataKey="expos" name="Expos en curso" fill="#3d373d" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
