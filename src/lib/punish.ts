export type Action = "warn" | "timeout" | "ban" | "alert";

export interface LadderStep {
  from: number; // points reached
  action: "warn" | "timeout" | "ban";
  duration: number; // seconds (timeouts)
}

export interface Decision {
  action: Action;
  duration: number;
  points: number; // points this offence adds
  total: number; // total active points after this offence
  reason: string;
}

/** Decide the punishment for a new offence. `priorPoints` = active (non-expired, non-cleared) points before it. */
export function decide(
  category: string,
  priorPoints: number,
  opts: { ladder: LadderStep[]; weights: Record<string, number>; sexualInstantBan: boolean },
): Decision {
  if (category === "provoking") {
    return { action: "alert", duration: 0, points: 0, total: priorPoints, reason: "Provoking — admins alerted" };
  }
  if (category === "sexual" && opts.sexualInstantBan) {
    return { action: "ban", duration: 0, points: 0, total: priorPoints, reason: "Sexual harassment — instant ban" };
  }
  const points = Number(opts.weights[category] ?? (category === "sexual" ? 5 : 1));
  const total = priorPoints + points;
  const steps = [...opts.ladder].sort((a, b) => a.from - b.from);
  let step: LadderStep = steps[0] ?? { from: 1, action: "warn", duration: 0 };
  for (const s of steps) if (total >= s.from) step = s;
  return {
    action: step.action,
    duration: step.action === "timeout" ? step.duration : 0,
    points,
    total,
    reason: `${category} slang — ${total} point${total === 1 ? "" : "s"}`,
  };
}
