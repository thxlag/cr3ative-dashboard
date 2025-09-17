import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
import type { GuildSettings } from "@/types/api";

export function useGuildSettings(guildId?: string) {
  return useQuery<GuildSettings, Error>({
    queryKey: ["guild-settings", guildId],
    queryFn: () => fetchJson<GuildSettings>(`/api/admin/guilds/${guildId}/settings`),
    enabled: Boolean(guildId),
    staleTime: 60_000,
  });
}
