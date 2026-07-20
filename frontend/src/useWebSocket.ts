import { useEffect, useRef } from "react";

export function useWebSocket(onMessage: (data: unknown) => void): void {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closedByUs = false;
    let retry: number | undefined;

    const connect = (): void => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const url = `${proto}://${location.host}/ws`;
      try {
        socket = new WebSocket(url);
      } catch {
        scheduleRetry();
        return;
      }

      socket.onmessage = (event: MessageEvent): void => {
        let parsed: unknown = event.data;
        if (typeof event.data === "string") {
          try {
            parsed = JSON.parse(event.data);
          } catch {
            parsed = event.data;
          }
        }
        onMessageRef.current(parsed);
      };

      socket.onclose = (): void => {
        if (!closedByUs) scheduleRetry();
      };

      socket.onerror = (): void => {
        socket?.close();
      };
    };

    const scheduleRetry = (): void => {
      if (closedByUs) return;
      retry = window.setTimeout(connect, 3000);
    };

    connect();

    return () => {
      closedByUs = true;
      if (retry) window.clearTimeout(retry);
      socket?.close();
    };
  }, []);
}
