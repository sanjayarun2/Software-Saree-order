export type ReportPeriod = "this_week" | "last_week" | "this_month" | "last_month" | "this_quarter" | "last_quarter" | "this_year" | "last_year" | "custom";

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;
  label: string;
}

export function getDateRange(period: ReportPeriod, customFrom?: string, customTo?: string): DateRange {
  const today = new Date();
  const toDate = new Date(today);
  toDate.setHours(23, 59, 59, 999);

  let from: Date;
  let label: string;

  switch (period) {
    case "this_week": {
      const day = today.getDay();
      const monOffset = day === 0 ? -6 : 1 - day;
      from = new Date(today);
      from.setDate(today.getDate() + monOffset);
      from.setHours(0, 0, 0, 0);
      label = `This Week (${from.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} - ${toDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})`;
      break;
    }
    case "last_week": {
      const day = today.getDay();
      const monOffset = day === 0 ? -6 : 1 - day;
      from = new Date(today);
      from.setDate(today.getDate() + monOffset - 7);
      from.setHours(0, 0, 0, 0);
      const endOfLastWeek = new Date(from);
      endOfLastWeek.setDate(from.getDate() + 6);
      endOfLastWeek.setHours(23, 59, 59, 999);
      toDate.setTime(endOfLastWeek.getTime());
      label = `Last Week`;
      break;
    }
    case "this_month": {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      label = `This Month (${from.toLocaleDateString("en-GB", { month: "long", year: "numeric" })})`;
      break;
    }
    case "last_month": {
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      toDate.setDate(0); // last day of prev month
      toDate.setHours(23, 59, 59, 999);
      label = `Last Month (${from.toLocaleDateString("en-GB", { month: "long", year: "numeric" })})`;
      break;
    }
    case "this_quarter": {
      const q = Math.floor(today.getMonth() / 3) + 1;
      from = new Date(today.getFullYear(), (q - 1) * 3, 1);
      label = `This Quarter (Q${q} ${today.getFullYear()})`;
      break;
    }
    case "last_quarter": {
      const q = Math.floor(today.getMonth() / 3) + 1;
      const prevQ = q === 1 ? 4 : q - 1;
      const prevYear = q === 1 ? today.getFullYear() - 1 : today.getFullYear();
      from = new Date(prevYear, (prevQ - 1) * 3, 1);
      toDate.setFullYear(prevYear);
      toDate.setMonth((prevQ - 1) * 3 + 2);
      toDate.setDate(new Date(prevYear, prevQ * 3, 0).getDate());
      toDate.setHours(23, 59, 59, 999);
      label = `Last Quarter (Q${prevQ} ${prevYear})`;
      break;
    }
    case "this_year": {
      from = new Date(today.getFullYear(), 0, 1);
      label = `This Year (${today.getFullYear()})`;
      break;
    }
    case "last_year": {
      from = new Date(today.getFullYear() - 1, 0, 1);
      toDate.setFullYear(today.getFullYear() - 1);
      toDate.setMonth(11);
      toDate.setDate(31);
      toDate.setHours(23, 59, 59, 999);
      label = `Last Year (${today.getFullYear() - 1})`;
      break;
    }
    case "custom":
    default: {
      if (customFrom && customTo) {
        from = new Date(customFrom);
        from.setHours(0, 0, 0, 0);
        const to = new Date(customTo);
        to.setHours(23, 59, 59, 999);
        toDate.setTime(to.getTime());
        label = `Custom (${from.toLocaleDateString("en-GB")} - ${toDate.toLocaleDateString("en-GB")})`;
      } else {
        from = new Date(today.getFullYear(), today.getMonth(), 1);
        label = "Custom";
      }
      break;
    }
  }

  return {
    from: from.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
    label,
  };
}

export function getPreviousPeriodRange(current: DateRange): DateRange {
  const fromDate = new Date(current.from);
  const toDate = new Date(current.to);
  const diffMs = toDate.getTime() - fromDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

  const prevTo = new Date(fromDate);
  prevTo.setDate(prevTo.getDate() - 1);
  prevTo.setHours(23, 59, 59, 999);

  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - diffDays + 1);
  prevFrom.setHours(0, 0, 0, 0);

  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
    label: "Previous period",
  };
}
