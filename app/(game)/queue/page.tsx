import { loadActiveQueue } from "@/lib/game/loadActiveQueue";
import { ActiveQueueView } from "@/components/queue/ActiveQueueView";

export default async function QueuePage() {
  const { items, credits } = await loadActiveQueue();

  return <ActiveQueueView items={items} credits={credits} />;
}
