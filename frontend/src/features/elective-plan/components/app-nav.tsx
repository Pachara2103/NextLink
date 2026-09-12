"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/elective-plan", label: "ภาพรวมแผน" },
  { href: "/elective-plan/rooms", label: "ห้องเรียน" },
  { href: "/elective-plan/courses/list", label: "รายวิชา" },
  { href: "/elective-plan/courses", label: "ช่วงที่สะดวก" },
];

/**
 * One nav for every header, including the loading skeleton's.
 *
 * Each dashboard used to carry its own copy and the skeleton carried none, so
 * switching sections made the whole control vanish and come back — the worst
 * kind of flicker to sit under the cursor you just clicked with.
 */
export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="ส่วนของระบบ">
      {sections.map((section) => {
        const isActive = pathname === section.href || (section.href === "/elective-plan/rooms" && pathname.startsWith("/elective-plan/rooms/"));
        return (
          <Link
            key={section.href}
            className={isActive ? "is-active" : ""}
            href={section.href}
            aria-current={isActive ? "page" : undefined}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
