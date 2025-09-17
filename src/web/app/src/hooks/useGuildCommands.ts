import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
import type { CommandToggle } from "@/types/api";

type TogglePayload = {
  id: string;
  enabled: boolean;
};

export function useGuildCommands(guildId?: string) {
  return useQuery<CommandToggle[], Error>({
    queryKey: ["guild-commands", guildId],
    queryFn: () => fetchJson<CommandToggle[]>(`/api/admin/guilds/${guildId}/commands`),
    enabled: Boolean(guildId),
    staleTime: 30_000,
  });
}

export function useCommandToggleMutation(guildId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, TogglePayload, { previous?: CommandToggle[] }>(
    {
      mutationFn: (payload) =>
        fetchJson<{ success: boolean }>(`/api/admin/guilds/${guildId}/commands`, {
          method: "POST",
          body: { commands: [payload] },
        }),
      onMutate: async (payload) => {
        await queryClient.cancelQueries({ queryKey: ["guild-commands", guildId] });
        const previous = queryClient.getQueryData<CommandToggle[]>(["guild-commands", guildId]);
        queryClient.setQueryData<CommandToggle[]>(["guild-commands", guildId], (old) =>
          old?.map((cmd) => (cmd.id === payload.id ? { ...cmd, enabled: payload.enabled } : cmd)) || [],
        );
        return { previous };
      },
      onError: (_err, _payload, context) => {
        if (context?.previous) {
          queryClient.setQueryData(["guild-commands", guildId], context.previous);
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: ["guild-commands", guildId] });
      },
    },
  );
}
