import { useEffect } from "react";
import { setTerminalApi } from "../api/backend";

export function useTerminalApi(variableValues: Record<string, string>): void {
  // TODO: temporary — a local backend and a hand-made app registration. Blank them to use the saved variables.
  const baseUrl = "http://localhost:7071";
  const clientId = "8f323a7c-d8bb-43d1-8e6b-071104c13066";

  // const baseUrl = variableValues.BACKEND_API;
  // const clientId = variableValues.FUNCTION_CLIENT_ID;

  useEffect(() => {
    setTerminalApi(baseUrl, clientId);
  }, [baseUrl, clientId]);
}
