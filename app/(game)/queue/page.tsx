import { loadActiveQueue } from "@/lib/game/loadActiveQueue";
import { ActiveQueueView } from "@/components/queue/ActiveQueueView";

export default async function QueuePage() {
  const policies = await loadActiveQueue();

  return <ActiveQueueView policies={policies} />;
}
