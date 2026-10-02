import { stopStreaming } from "../../../integrations/harness/core/apply";
import {
  buildDeterministicHandoff,
  completeHandoff,
  isPreparingHandoff,
} from "./handoff";
import type { Session } from "./session";

/** The session after the user presses Stop on its turn. */
export function stopSessionTurn(session: Session): Session {
  const stopped = stopStreaming(session);
  const completed = isPreparingHandoff(stopped)
    ? completeHandoff(stopped, buildDeterministicHandoff(stopped))
    : stopped;
  // Stop disarms resume-at-reset so no turn starts on its own later.
  const ready: Session = {
    ...completed,
    worktreePreparing: undefined,
    usageLimit: undefined,
  };
  return ready.queuedMessages?.length
    ? { ...ready, queueStatus: "paused" }
    : ready;
}
