import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { triggerRemoteLogin } from "../api";
import { createSessionCredentials, deleteSession, negotiateSession, registerSession } from "../api/remoteTerminal";
import type { SessionCredentials } from "../api/remoteTerminal";
import { TERMINAL_COLS, TERMINAL_ROWS } from "../config/remoteTerminal";
import { parseSocketEvent } from "../logic/remoteTerminal";
import type { Cloud, RunnerMessage, TerminalStatus } from "../logic/remoteTerminal";
import type { Account, GhEnv } from "../types";

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10000;

const TERMINAL_THEME = {
  background: "#1e1e2e",
  foreground: "#cdd6f4",
  cursor: "#89b4fa",
  selectionBackground: "#45475a",
};

export type DeviceCode = { cloud: Cloud; url: string; code?: string };

export interface UseRemoteTerminal {
  terminal: Terminal | null;
  status: TerminalStatus;
  sessionId: string | null;
  stage: string | null;
  deviceCode: DeviceCode | null;
  loggedIn: Cloud[];
  runnerJoined: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  resize: (cols: number, rows: number) => void;
}

export function useRemoteTerminal(opts: {
  account: Account | null;
  repoName: string;
  workflowId: string;
  dir: string;
  selectedEnv: GhEnv | null;
}): UseRemoteTerminal {
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<DeviceCode | null>(null);
  const [loggedIn, setLoggedIn] = useState<Cloud[]>([]);
  const [runnerJoined, setRunnerJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const credsRef = useRef<SessionCredentials | null>(null);
  const stoppedRef = useRef(true);
  const joinedRef = useRef(false);
  const attemptsRef = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => Promise<void>>(async () => {});

  const sendToGroup = useCallback((payload: object) => {
    const ws = wsRef.current;
    const creds = credsRef.current;
    if (!ws || !creds || ws.readyState !== WebSocket.OPEN || !joinedRef.current) return;
    ws.send(
      JSON.stringify({
        type: "sendToGroup",
        group: creds.sessionId,
        dataType: "text",
        noEcho: true,
        data: JSON.stringify(payload),
      }),
    );
  }, []);

  const resize = useCallback(
    (cols: number, rows: number) => sendToGroup({ type: "resize", cols, rows }),
    [sendToGroup],
  );

  // Detach the handlers first, so a close from the old socket cannot reconnect the next session.
  const closeSocket = () => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (!ws) return;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    ws.close();
  };

  const stop = useCallback(() => {
    stoppedRef.current = true;
    joinedRef.current = false;
    attemptsRef.current = 0;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
    closeSocket();
    termRef.current?.dispose();
    termRef.current = null;
    const creds = credsRef.current;
    credsRef.current = null;
    if (creds) void deleteSession(creds.sessionId);
    setTerminal(null);
    setStatus("idle");
    setSessionId(null);
    setStage(null);
    setDeviceCode(null);
    setLoggedIn([]);
    setRunnerJoined(false);
    setError(null);
  }, []);

  const handleRunnerMessage = (message: RunnerMessage) => {
    setRunnerJoined(true);
    switch (message.type) {
      case "terminal":
        termRef.current?.write(message.data);
        break;
      case "deviceCode":
        setDeviceCode({ cloud: message.cloud, url: message.url, code: message.code });
        break;
      case "loginCompleted":
        setLoggedIn((prev) => (prev.includes(message.cloud) ? prev : [...prev, message.cloud]));
        setDeviceCode(null);
        break;
      case "loginFailed":
        setError(`${message.cloud === "aws" ? "AWS" : "Azure"} login failed (exit ${message.exitCode})`);
        setStage("error");
        break;
      case "stage":
        setStage(message.stage);
        break;
      case "terraformCompleted":
        setStage("done");
        break;
      case "terraformFailed":
        setError(`Terraform failed (exit ${message.exitCode})`);
        setStage("error");
        break;
    }
  };

  const scheduleReconnect = () => {
    if (stoppedRef.current) return;
    if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setStatus("error");
      setError("Lost the terminal connection. Deploy again to start a new session.");
      return;
    }
    attemptsRef.current += 1;
    setStatus("reconnecting");
    const delay = Math.min(RECONNECT_BASE_MS * attemptsRef.current, RECONNECT_MAX_MS);
    reconnectTimer.current = setTimeout(() => void connectRef.current(), delay);
  };

  const connect = async () => {
    const creds = credsRef.current;
    if (!creds || stoppedRef.current) return;

    let clientUrl: string;
    try {
      clientUrl = await negotiateSession(creds);
    } catch (e) {
      console.error("Failed to negotiate the terminal session:", e);
      scheduleReconnect();
      return;
    }
    if (stoppedRef.current) return;

    setStatus("connecting");
    const ws = new WebSocket(clientUrl, "json.webpubsub.azure.v1");
    wsRef.current = ws;
    joinedRef.current = false;

    ws.onmessage = (event) => {
      const parsed = parseSocketEvent(String(event.data), creds.sessionId);
      if (!parsed) return;
      if (parsed.kind === "connected") {
        ws.send(JSON.stringify({ type: "joinGroup", group: creds.sessionId, ackId: 1 }));
        return;
      }
      if (parsed.kind === "ack") {
        if (!parsed.success) {
          setStatus("error");
          setError("Could not join the terminal session");
          return;
        }
        joinedRef.current = true;
        attemptsRef.current = 0;
        setStatus("connected");
        setError(null);
        const term = termRef.current;
        sendToGroup({ type: "resize", cols: term?.cols ?? TERMINAL_COLS, rows: term?.rows ?? TERMINAL_ROWS });
        return;
      }
      handleRunnerMessage(parsed.message);
    };

    ws.onerror = () => setError("Terminal connection error");
    ws.onclose = () => {
      joinedRef.current = false;
      if (wsRef.current === ws) wsRef.current = null;
      scheduleReconnect();
    };
  };
  useLayoutEffect(() => {
    connectRef.current = connect;
  });

  const start = useCallback(async () => {
    const { account, repoName, workflowId, dir, selectedEnv } = optsRef.current;
    if (!account || !repoName || !selectedEnv) return;

    stop();
    setStatus("starting");

    const term = new Terminal({
      cols: TERMINAL_COLS,
      rows: TERMINAL_ROWS,
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 12,
      cursorBlink: true,
      scrollback: 5000,
      theme: TERMINAL_THEME,
    });
    term.onData((data) => sendToGroup({ type: "input", data }));
    termRef.current = term;
    setTerminal(term);

    const creds = createSessionCredentials();
    credsRef.current = creds;
    stoppedRef.current = false;
    setSessionId(creds.sessionId);

    try {
      await registerSession(creds);
      await triggerRemoteLogin(account, repoName, workflowId, selectedEnv.name, selectedEnv.name, creds.sessionId, dir);
    } catch (e) {
      console.error("Failed to start the remote login session:", e);
      setStatus("error");
      setError(e instanceof Error ? e.message : "Failed to start the remote login session");
      return;
    }

    await connectRef.current();
  }, [sendToGroup, stop]);

  useEffect(() => stop, [stop]);

  return { terminal, status, sessionId, stage, deviceCode, loggedIn, runnerJoined, error, start, stop, resize };
}
