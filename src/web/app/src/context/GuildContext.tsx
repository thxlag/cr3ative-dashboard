import { createContext, useContext } from "react";
import type { AdminGuild } from "@/types/session";

type GuildContextValue = {
  activeGuildId?: string;
  setActiveGuildId: (guildId?: string) => void;
  guilds: AdminGuild[];
};

export const GuildContext = createContext<GuildContextValue | undefined>(undefined);

export function useGuildContext() {
  const ctx = useContext(GuildContext);
  if (!ctx) {
    throw new Error('useGuildContext must be used within a GuildContext provider');
  }
  return ctx;
}
