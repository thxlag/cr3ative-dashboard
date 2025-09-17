export type AdminGuild = {
  id: string;
  name: string;
};

export type SessionUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  adminGuilds: AdminGuild[];
};

export type SessionResponse = {
  authenticated: boolean;
  user?: SessionUser;
};
