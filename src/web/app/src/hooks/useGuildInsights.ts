import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
import type { GuildInsights } from "@/types/api";

export function useGuildInsights(guildId?: string) {
  return useQuery<GuildInsights, Error>({
    queryKey: ["guild-insights", guildId],
    queryFn: () => fetchJson<GuildInsights>(`/api/admin/guilds/${guildId}/insights`),
    enabled: Boolean(guildId),
    refetchInterval: 5 * 60_000,
  });
}
