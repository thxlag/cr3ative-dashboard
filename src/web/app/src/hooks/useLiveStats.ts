import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { GlobalStats } from "@/types/api";

type StatsMessage = {
  type: string;
  payload?: unknown;
};

export function useLiveStats(shouldConnect: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!shouldConnect) return;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);

    ws.onmessage = (event) => {
      try {
        const data: StatsMessage = JSON.parse(event.data);
        if (data.type === "stats" && data.payload) {
          queryClient.setQueryData<GlobalStats>(["global-stats"], (current) => ({
            ...(current || ({} as GlobalStats)),
            ...(data.payload as GlobalStats),
          }));
        }
      } catch (error) {
        console.warn("Failed to parse stats payload", error);
      }
    };

    ws.onerror = (err) => {
      console.warn("WebSocket error", err);
    };

    return () => {
      ws.close();
    };
  }, [queryClient, shouldConnect]);
}
