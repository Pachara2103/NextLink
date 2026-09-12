"use client";

import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProfileModal } from "@/components/auth/ProfileModal";
import { Icon, type IconName } from "@/components/icons";
import { ConfirmModal } from "@/components/ui/Modal";
import { MESSAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth-store";
import { useConsole } from "@/store/console-store";
import type { PanelKey } from "@/types";

interface NavItem {
  key: PanelKey;
  label: string;
  icon: IconName;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "contacts", label: "สรุปข้อมูลจากไลน์", icon: "inbox" },
  { key: "groups", label: "กลุ่มไลน์และบริษัท", icon: "building" },
  { key: "people", label: "ผู้ติดต่อและบุคคลในบริษัท", icon: "users" },
  { key: "notes", label: "โน้ตบันทึกข้อมูล", icon: "note" },
  { key: "agent", label: "คุณขวัญใจ", icon: "bot" },
  // { key: "library", label: "คลังสถานะ & Component", icon: "layers" },
];

export function Sidebar({
  active,
  onNavigate,
}: {
  active: PanelKey | "planner";
  onNavigate: (panel: PanelKey) => void;
}) {
  const {
    groupLines,
    linkedGroups,
    pendingCount,
    staffCount,
    unlinkedGroups,
  } = useConsole();
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    // signOut never rejects — it drops the local session even if the API call
    // fails — so there is no failure branch to land back on this screen.
    await signOut();
    router.replace("/login");
  }

  const counts: Partial<Record<PanelKey, { value: number; tone: string }>> = {
    contacts: { value: pendingCount, tone: "bg-accent-soft text-accent" },
    // Not a queue like the other two — nothing here needs attention — so it
    // is the neutral chip rather than one that reads as a backlog.
    people: { value: staffCount, tone: "bg-surface-2 text-text-3" },
    groups: {
      value: unlinkedGroups.length,
      tone: "bg-warn-soft text-warn",
    },
  };

  const ratio =
    groupLines.length === 0
      ? 0
      : Math.round((linkedGroups.length / groupLines.length) * 100);

  return (
    <aside className="sticky top-0 hidden h-screen overflow-y-auto w-[266px] shrink-0 flex-col border-r border-line-soft bg-surface/70 backdrop-blur-xl lg:flex">
      <div className="flex items-center px-6 py-6">

        <img
          src="/nextlink-logo.png"
          alt="NextLink Icon"
          width={40}
          height={40}
          className="size-10 shrink-0 object-contain"
        />

        <img
         src="/nextlink-text.png"
         alt="NextLink Text"
         className="nextlink-wordmark h-15 w-auto shrink-0"
        />
      </div>

      <nav className="flex flex-col gap-1 px-3">
      
        {NAV_ITEMS.map((item) => {
          const on = item.key === active;
          const count = counts[item.key];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
                on
                  ? "bg-accent-soft text-text shadow-[inset_0_0_0_1px_var(--color-accent-line)]"
                  : "text-text-2 hover:bg-surface-2 hover:text-text",
              )}
            >
              <Icon
                name={item.icon}
                className={cn(
                  "size-[18px] shrink-0",
                  on ? "text-accent" : "text-text-3",
                )}
              />
              <span className="flex-1 truncate font-medium">{item.label}</span>
              {count && count.value > 0 && (
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums",
                    count.tone,
                  )}
                >
                  {count.value}
                </span>
              )}
            </button>
          );
        })}
        <Link href="/elective-plan" aria-current={active === "planner" ? "page" : undefined}
          className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", active === "planner" ? "bg-accent-soft text-text shadow-[inset_0_0_0_1px_var(--color-accent-line)]" : "text-text-2 hover:bg-surface-2 hover:text-text")}>
          <Icon name="layers" className="size-[18px] text-accent" />
          จัดตารางวิชาเลือก
        </Link>
      </nav>

      <div className="mt-auto space-y-3 p-4">
        <ThemeSwitcher />
        <div className="rounded-xl border border-line-soft bg-surface p-4">
          <span className="font-mono text-[10px] tracking-[0.14em] text-text-3 uppercase">
            ความคืบหน้าการผูกบริษัท
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-semibold tabular-nums text-text">
              {ratio}
            </span>
            <span className="text-sm text-text-3">%</span>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-ok"
              style={{ width: `${ratio}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-text-3">
            ผูกแล้ว {linkedGroups.length} จาก {groupLines.length} กลุ่ม
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
          {/* One glyph rather than the first two letters of the name: sliced
              Thai text cuts mid-cluster ("แอดมิน" came out as "แอ"), and a
              console with a single admin account gains nothing from initials. */}
          <div className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-text-3">
            <Icon name="user" className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            {/* display_name is nullable, so an account that has never set one
                says so rather than falling back to the login name. */}
            <div
              className={cn(
                "truncate text-[13px] font-medium",
                user?.displayName ? "text-text" : "text-text-3 italic",
              )}
            >
              {user?.displayName ?? MESSAGES.noDisplayName}
            </div>
            <div className="truncate text-[11px] text-text-3">
              ผู้ดูแลระบบ
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditingProfile(true)}
            aria-label="ตั้งค่าบัญชี"
            title="ตั้งค่าบัญชี"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-text-3 transition hover:bg-surface-2 hover:text-text"
          >
            <Icon name="settings" className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmingSignOut(true)}
            aria-label="ออกจากระบบ"
            title="ออกจากระบบ"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-text-3 transition hover:bg-danger-soft hover:text-danger"
          >
            <Icon name="log-out" className="size-4" />
          </button>
        </div>
      </div>

      <ProfileModal
        open={editingProfile}
        onClose={() => setEditingProfile(false)}
      />

      <ConfirmModal
        open={confirmingSignOut}
        icon="log-out"
        tone="danger"
        title="ออกจากระบบ"
        confirmLabel="ออกจากระบบ"
        loading={signingOut}
        onConfirm={onSignOut}
        onCancel={() => setConfirmingSignOut(false)}
      >
        ต้องการออกจากระบบใช่หรือไม่?
      </ConfirmModal>
    </aside>
  );
}
