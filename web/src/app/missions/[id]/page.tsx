import { RoomScreen } from "@/features/room/room-screen";

export default async function MissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RoomScreen roomId={id} view="missions" />;
}
