import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
import type { SessionResponse } from "@/types/session";

export function useSession() {
  return useQuery<SessionResponse, Error>({
    queryKey: ["session"],
    queryFn: () => fetchJson<SessionResponse>("/auth/session"),
    staleTime: 60_000,
  });
}
