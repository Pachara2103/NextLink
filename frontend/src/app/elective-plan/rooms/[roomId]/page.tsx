import { RoomSchedule } from "@/features/elective-plan/components/room-schedule";
import { getPlanPayload } from "@/features/elective-plan/lib/plan-data.ts";

export function generateStaticParams() {
  return getPlanPayload().rooms.map((room) => ({ roomId: room.id }));
}

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <RoomSchedule payload={getPlanPayload()} roomId={roomId} />;
}
