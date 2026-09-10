"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState, GroupCardSkeleton } from "@/components/ui/EmptyState";
import {
  SearchInput,
  SelectField,
  TextField,
} from "@/components/ui/Field";
import { Pagination } from "@/components/ui/Pagination";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { MESSAGES, RELEVANT_OPTIONS } from "@/lib/constants";

/**
 * Every state the two working panels can reach, side by side. Handy while
 * building Figma components and as a regression surface for the design tokens.
 */
export function LibraryPanel() {
  const [mode, setMode] = useState<"add" | "search">("add");
  const [page, setPage] = useState(2);
  const [term, setTerm] = useState("latech");

  return (
    <div>
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text">
          คลังสถานะ &amp; Component
        </h1>
        <p className="mt-1 text-sm text-text-2">
          สถานะทั้งหมดที่ต้องมีใน Figma — Empty, Loading, Alert, Badge, Button, Input
        </p>
      </header>

      <Group title="Empty states">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <EmptyState
            icon="inbox"
            title="ยังไม่มีรายการ"
            detail="กด อัปเดตข้อมูล เพื่อให้ AI ดึงและสรุปข้อมูลจากกลุ่มไลน์"
            action={
              <Button variant="primary" icon="sparkles">
                อัปเดตข้อมูล
              </Button>
            }
          />
          <EmptyState
            icon="search"
            title="ไม่พบรายการที่ค้นหา"
            detail="ลองใช้คำสั้นลง หรือค้นด้วยชื่อบริษัทภาษาอังกฤษแทน"
            action={<Button>ล้างคำค้น</Button>}
          />
          <EmptyState
            icon="unlink"
            title="ยังไม่มีกลุ่มไลน์ที่ผูกบริษัท"
            detail="เริ่มจากผูกบริษัทให้กลุ่มในรายการด้านล่าง"
          />
          <EmptyState
            icon="check-circle"
            tone="success"
            title="ผูกบริษัทครบทุกกลุ่มไลน์แล้ว"
            detail="ไม่มีกลุ่มที่ค้างอยู่ในคิว"
          />
        </div>
      </Group>

      <Group title="Alerts & feedback">
        <div className="space-y-2.5">
          <Alert tone="success" title="บันทึกข้อมูลคุณ พชร อุ้ยกิ้ม แล้ว" />
          <Alert
            tone="error"
            title={MESSAGES.requireEmployeeName}
            onDismiss={() => undefined}
          />
          <Alert tone="warn" title={MESSAGES.companyNotFound} />
          <Alert
            tone="loading"
            title="กำลังวิเคราะห์ข้อมูล..."
            trailing={
              <div className="ml-auto hidden h-1 w-32 overflow-hidden rounded-full bg-surface-2 sm:block">
                <div className="h-full w-2/5 rounded-full bg-accent" />
              </div>
            }
          />
          <Alert tone="info" title={MESSAGES.editCancelled} />
        </div>
      </Group>

      <Group title="Loading skeleton">
        <div className="space-y-2.5">
          <GroupCardSkeleton />
          <GroupCardSkeleton />
        </div>
      </Group>

      <Group title="Badges">
        <Panel>
          <div className="flex flex-wrap gap-2.5">
            <Badge tone="matched" dot>
              ผูกบริษัทแล้ว
            </Badge>
            <Badge tone="unmatched" dot>
              ยังไม่ได้ผูกบริษัท
            </Badge>
            <Badge tone="pending">รอยืนยัน</Badge>
            <Badge tone="completed">บันทึกแล้ว</Badge>
            <Badge tone="unmatched">ข้อมูลไม่ครบ 2 ช่อง</Badge>
            {RELEVANT_OPTIONS.slice(1).map((option) => (
              <Badge key={option.value} tone="neutral">
                {option.label}
              </Badge>
            ))}
            <Badge tone="muted">ไม่มีข้อมูล</Badge>
          </div>
        </Panel>
      </Group>

      <Group title="Buttons">
        <Panel>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="warn" icon="plus">
              Primary · warn
            </Button>
            <Button>Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <IconButton icon="pencil" label="แก้ไข" />
            <Button disabled>Disabled</Button>
            <Button variant="primary" loading>
              กำลังบันทึก
            </Button>
          </div>
        </Panel>
      </Group>

      <Group title="Inputs">
        <Panel>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Default" placeholder="พิมพ์ข้อความ..." />
            <TextField label="Filled" defaultValue="พชร อุ้ยกิ้ม" />
            <TextField
              label="With hint"
              defaultValue="012-345-6789"
              mono
              hint="ไม่มีการตรวจรูปแบบเบอร์โทร"
            />
            <TextField label="Error" error={MESSAGES.requireEmployeeName} />
            <SelectField
              label="Select"
              options={RELEVANT_OPTIONS}
              defaultValue={RELEVANT_OPTIONS[1].value}
            />
            <TextField label="Disabled" defaultValue="แก้ไขไม่ได้" disabled />
            <div className="sm:col-span-2">
              <SearchInput
                value={term}
                onValueChange={setTerm}
                onClear={() => setTerm("")}
                placeholder="ค้นหาด้วยชื่อกลุ่มไลน์ หรือชื่อบริษัท..."
              />
            </div>
            <div className="sm:col-span-2">
              <SegmentedControl
                value={mode}
                onChange={setMode}
                options={[
                  { value: "add", label: "เพิ่มชื่อบริษัทใหม่" },
                  { value: "search", label: "ค้นหาบริษัทที่มีอยู่" },
                ]}
              />
            </div>
          </div>
        </Panel>
      </Group>

      <Group title="Pagination">
        <Pagination page={page} totalPages={4} onChange={setPage} />
      </Group>

      {/* The palette itself, in the order the tokens are meant to be reached
          for: the four planes, the two rules, the four text steps, then the
          four meanings. Every colour in the console is one of these — see the
          CARBON block in app/globals.css. */}
      <Group title="Color tokens · carbon">
        <Panel>
          <p className="text-[12.5px] text-text-3">
            พื้นและเส้น — ไล่จากลึกสุดไปสว่างสุด
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Swatch swatch="bg-bg border border-line" name="bg" note="#0A0C0E · หน้า" />
            <Swatch swatch="bg-sunken border border-line" name="sunken" note="#0D1114 · ช่องจม" />
            <Swatch swatch="bg-surface border border-line" name="surface" note="#101418 · การ์ด" />
            <Swatch swatch="bg-surface-2 border border-line" name="surface-2" note="#151A1F · ชิป/hover" />
            <Swatch swatch="bg-line-soft" name="line-soft" note="#1B2127 · เส้นบาง" />
            <Swatch swatch="bg-line" name="line" note="#232A31 · เส้นหลัก" />
          </div>

          <p className="mt-5 text-[12.5px] text-text-3">
            ตัวอักษร 4 ระดับ — หัวเรื่อง · เนื้อความ · คำอธิบาย · เกือบเป็นเฟอร์นิเจอร์
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Swatch swatch="bg-text" name="text" note="#EEF2F5" />
            <Swatch swatch="bg-text-2" name="text-2" note="#B9C3CC" />
            <Swatch swatch="bg-text-3" name="text-3" note="#7F8B96" />
            <Swatch swatch="bg-text-4" name="text-4" note="#59636D" />
          </div>

          <p className="mt-5 text-[12.5px] text-text-3">
            ความหมาย — แต่ละสีมีคู่ <span className="font-mono text-[11px]">-soft</span> (พื้น) และ{" "}
            <span className="font-mono text-[11px]">-line</span> (เส้น)
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Swatch swatch="bg-accent" name="accent" note="#22D3EE · ปุ่มหลัก/เมนูปัจจุบัน" />
            <Swatch swatch="bg-ok" name="ok" note="#34D399 · ผูกแล้ว/อนุมัติ" />
            <Swatch swatch="bg-warn" name="warn" note="#FBBF24 · ยังไม่ผูก/รออนุมัติ" />
            <Swatch swatch="bg-danger" name="danger" note="#FB7185 · ลบ/ยกเลิก" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Swatch
              swatch="bg-accent-soft border border-accent-line"
              name="accent-soft / -line"
              note="พื้น + เส้นของ accent"
            />
            <Swatch
              swatch="bg-ok-soft border border-ok-line"
              name="ok-soft / -line"
              note="พื้น + เส้นของ ok"
            />
            <Swatch
              swatch="bg-warn-soft border border-warn-line"
              name="warn-soft / -line"
              note="พื้น + เส้นของ warn"
            />
            <Swatch
              swatch="bg-danger-soft border border-danger-line"
              name="danger-soft / -line"
              note="พื้น + เส้นของ danger"
            />
          </div>

          <p className="mt-5 text-[12.5px] text-text-3">
            สีตัวอักษรบนพื้นทึบ — ห้ามใช้ขาวบนปุ่มที่ถมสี
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="grid h-14 place-items-center rounded-xl bg-accent font-display text-[13px] font-semibold text-accent-ink">
              accent-ink
            </div>
            <div className="grid h-14 place-items-center rounded-xl bg-warn font-display text-[13px] font-semibold text-warn-ink">
              warn-ink
            </div>
            <div className="grid h-14 place-items-center rounded-xl bg-accent-hover font-display text-[13px] font-semibold text-accent-ink">
              accent-hover
            </div>
            <div className="grid h-14 place-items-center rounded-xl bg-danger-strong font-display text-[13px] font-semibold text-danger">
              danger-strong
            </div>
          </div>
        </Panel>
      </Group>
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-9">
      <h2 className="font-mono text-[10px] tracking-[0.16em] text-text-3 uppercase">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line-soft bg-surface p-5">
      {children}
    </div>
  );
}

function Swatch({
  swatch,
  name,
  note,
}: {
  swatch: string;
  name: string;
  note: string;
}) {
  return (
    <div>
      <div className={`h-14 rounded-xl ${swatch}`} />
      <p className="mt-1.5 font-mono text-[11px] text-text-2">{name}</p>
      <p className="font-mono text-[10px] text-text-4">{note}</p>
    </div>
  );
}
