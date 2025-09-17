import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
import type { ModLogEntry } from "@/types/api";

export function useGuildModLogs(guildId?: string) {
  return useQuery<ModLogEntry[], Error>({
    queryKey: ["guild-modlogs", guildId],
    queryFn: () => fetchJson<ModLogEntry[]>(`/api/admin/guilds/${guildId}/modlogs`),
    enabled: Boolean(guildId),
    refetchInterval: 60_000,
  });
}
