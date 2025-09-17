import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
import type { AdminGuild } from "@/types/session";

export function useAdminGuilds() {
  return useQuery<AdminGuild[], Error>({
    queryKey: ["admin-guilds"],
    queryFn: () => fetchJson<AdminGuild[]>("/api/admin/guilds"),
    staleTime: 60_000,
  });
}
