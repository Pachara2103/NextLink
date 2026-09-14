import type { Metadata } from "next";
import { RoomList } from "@/features/elective-plan/components/room-list";

export const metadata: Metadata = { title: "NextLink · ห้องเรียน" };

export default function RoomsPage() {
  return <RoomList />;
}
