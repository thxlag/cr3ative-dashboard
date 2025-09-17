import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";

type HealthResponse = {
  status: string;
  uptime: number;
};

export function useBotStatus() {
  return useQuery<HealthResponse, Error>({
    queryKey: ["bot-status"],
    queryFn: () => fetchJson<HealthResponse>("/health"),
    refetchInterval: 15_000,
  });
}
