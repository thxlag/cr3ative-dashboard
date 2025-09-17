import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
import type { GlobalStats } from "@/types/api";

export function useGlobalStats() {
  return useQuery<GlobalStats, Error>({
    queryKey: ["global-stats"],
    queryFn: () => fetchJson<GlobalStats>("/api/admin/stats"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
