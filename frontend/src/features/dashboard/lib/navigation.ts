export const DASHBOARD_ROUTES = [
  { href: "/dashboard/electives", label: "วิชาเลือก" },
  { href: "/dashboard/internship", label: "ฝึกงาน" },
  { href: "/dashboard/cooperative", label: "สหกิจ" },
  { href: "/dashboard/mou", label: "MOU" },
  { href: "/dashboard/capstone", label: "Capstone" },
  { href: "/dashboard/friday-activities", label: "Friday Activity" },
] as const;

export const APP_ROUTES = [{ href: "/dashboard", label: "ภาพรวม Dashboard" }, ...DASHBOARD_ROUTES];
