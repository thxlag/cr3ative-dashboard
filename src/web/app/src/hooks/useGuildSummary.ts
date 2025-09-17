import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
import type { GuildSummary } from "@/types/api";

export function useGuildSummary(guildId?: string) {
  return useQuery<GuildSummary, Error>({
    queryKey: ["guild-summary", guildId],
    queryFn: () => fetchJson<GuildSummary>(`/api/admin/guilds/${guildId}`),
    enabled: Boolean(guildId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
