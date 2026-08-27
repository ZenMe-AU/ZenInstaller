// What the remote-login runner sends into the session group.
export type RunnerMessage =
  | { type: "terminal"; data: string }
  | { type: "deviceCode"; url: string; code: string }
  | { type: "loginCompleted" }
  | { type: "loginFailed"; exitCode: number }
  | { type: "stage"; stage: string }
  | { type: "terraformCompleted" }
  | { type: "terraformFailed"; exitCode: number };

export type SocketEvent =
  { kind: "connected" } | { kind: "ack"; success: boolean } | { kind: "runner"; message: RunnerMessage };

export type TerminalStatus = "idle" | "starting" | "connecting" | "connected" | "reconnecting" | "error";

const STAGE_LABELS: Record<string, string> = {
  connecting: "Connecting...",
  login: "Azure Login",
  "terraform-init": "Terraform Init",
  "terraform-plan": "Terraform Plan",
  done: "Complete",
  error: "Error",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

function asRunnerMessage(payload: unknown): RunnerMessage | null {
  if (typeof payload !== "object" || payload === null) return null;
  const type = (payload as { type?: unknown }).type;
  switch (type) {
    case "terminal":
    case "deviceCode":
    case "loginCompleted":
    case "loginFailed":
    case "stage":
    case "terraformCompleted":
    case "terraformFailed":
      return payload as RunnerMessage;
    default:
      return null;
  }
}

// Unwraps a Web PubSub JSON-protocol frame; null means it is not something this session acts on.
export function parseSocketEvent(raw: string, sessionId: string): SocketEvent | null {
  let frame: Record<string, unknown>;
  try {
    frame = JSON.parse(raw);
  } catch {
    return null;
  }

  if (frame.type === "system" && frame.event === "connected") return { kind: "connected" };
  if (frame.type === "ack") return { kind: "ack", success: frame.success === true };
  if (frame.type !== "message" || frame.group !== sessionId) return null;

  const data = frame.data;
  if (typeof data !== "string") {
    const message = asRunnerMessage(data);
    return message ? { kind: "runner", message } : null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    // Not JSON, so the runner streamed raw terminal bytes.
    return { kind: "runner", message: { type: "terminal", data } };
  }
  const message = asRunnerMessage(payload);
  return message ? { kind: "runner", message } : null;
}
