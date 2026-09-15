import { RoomSchedule } from "@/features/elective-plan/components/room-schedule";

/**
 * No `generateStaticParams`: which rooms exist is a row in `elective_rooms`,
 * not a line in a bundled file, so the list cannot be known at build time. The
 * page reads its room from the plan the provider already holds.
 */
export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <RoomSchedule roomId={roomId} />;
}
