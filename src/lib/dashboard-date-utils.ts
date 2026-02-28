export type DashboardDatePeriod =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "month"
  | "last_month"
  | "quarter"
  | "year"
  | "custom";

export interface DashboardDateRange {
  from: string;
  to: string;
  label: string;
}

function toYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getDashboardDateRange(
  period: DashboardDatePeriod,
  customFrom?: string,
  customTo?: string
): DashboardDateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let from: Date;
  let to: Date;
  let label: string;

  switch (period) {
    case "today": {
      from = new Date(today);
      to = new Date(today);
      to.setHours(23, 59, 59, 999);
      label = "Today";
      break;
    }
    case "yesterday": {
      from = new Date(today);
      from.setDate(today.getDate() - 1);
      to = new Date(from);
      to.setHours(23, 59, 59, 999);
      label = "Yesterday";
      break;
    }
    case "this_week": {
      const day = today.getDay();
      const monOffset = day === 0 ? -6 : 1 - day;
      from = new Date(today);
      from.setDate(today.getDate() + monOffset);
      from.setHours(0, 0, 0, 0);
      to = new Date(today);
      to.setHours(23, 59, 59, 999);
      label = "This Week";
      break;
    }
    case "last_week": {
      const day = today.getDay();
      const monOffset = day === 0 ? -6 : 1 - day;
      from = new Date(today);
      from.setDate(today.getDate() + monOffset - 7);
      from.setHours(0, 0, 0, 0);
      to = new Date(from);
      to.setDate(from.getDate() + 6);
      to.setHours(23, 59, 59, 999);
      label = "Last Week";
      break;
    }
    case "month": {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      to.setHours(23, 59, 59, 999);
      label = from.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      break;
    }
    case "last_month": {
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to = new Date(today.getFullYear(), today.getMonth(), 0);
      to.setHours(23, 59, 59, 999);
      label = from.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      break;
    }
    case "quarter": {
      const qMonth = Math.floor(today.getMonth() / 3) * 3;
      from = new Date(today.getFullYear(), qMonth, 1);
      to = new Date(today);
      to.setHours(23, 59, 59, 999);
      const qNum = Math.floor(qMonth / 3) + 1;
      label = `Q${qNum} ${today.getFullYear()}`;
      break;
    }
    case "year": {
      from = new Date(today.getFullYear(), 0, 1);
      to = new Date(today.getFullYear(), 11, 31);
      to.setHours(23, 59, 59, 999);
      label = String(today.getFullYear());
      break;
    }
    case "custom":
    default: {
      if (customFrom && customTo) {
        from = new Date(customFrom);
        from.setHours(0, 0, 0, 0);
        to = new Date(customTo);
        to.setHours(23, 59, 59, 999);
        label = `Custom (${from.toLocaleDateString("en-GB")} – ${to.toLocaleDateString("en-GB")})`;
      } else {
        from = new Date(today);
        to = new Date(today);
        to.setHours(23, 59, 59, 999);
        label = "Custom";
      }
      break;
    }
  }

  return {
    from: toYyyyMmDd(from),
    to: toYyyyMmDd(to),
    label,
  };
}
