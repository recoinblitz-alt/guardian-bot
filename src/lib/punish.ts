export type Action = "warn" | "timeout" | "ban" | "alert";

export interface LadderStep {
  from: number; // points reached
  action: "warn" | "timeout" | "ban";
  duration: number; // seconds (timeouts)
}

export interface NextStep {
  pointsLeft: number; // more points until it happens
  action: LadderStep["action"];
  duration: number;
}

export interface Decision {
  action: Action;
  duration: number;
  points: number; // points this offence adds
  total: number; // total active points after this offence
  reason: string;
  next: NextStep | null; // what happens if they keep going
}

function nextStep(total: number, ladder: LadderStep[]): NextStep | null {
  const steps = [...ladder].sort((a, b) => a.from - b.from);
  const s = steps.find((x) => x.from > total && x.action !== "warn");
  return s ? { pointsLeft: s.from - total, action: s.action, duration: s.action === "timeout" ? s.duration : 0 } : null;
}

/** Decide the punishment for a new offence. `priorPoints` = active (non-expired, non-cleared) points before it. */
export function decide(
  category: string,
  priorPoints: number,
  opts: { ladder: LadderStep[]; weights: Record<string, number>; sexualInstantBan: boolean },
): Decision {
  if (category === "provoking") {
    return { action: "alert", duration: 0, points: 0, total: priorPoints, reason: "Provoking — admins alerted", next: null };
  }
  if (category === "sexual" && opts.sexualInstantBan) {
    return { action: "ban", duration: 0, points: 0, total: priorPoints, reason: "Sexual harassment — instant ban", next: null };
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
    next: step.action === "ban" ? null : nextStep(total, opts.ladder),
  };
}
