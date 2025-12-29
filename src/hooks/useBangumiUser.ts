import { useQuery } from '@tanstack/react-query';

const API_BASE = 'https://api.bgm.tv/v0';

export interface BangumiUser {
  id: number;
  username: string;
  nickname: string;
  avatar: {
    large: string;
    medium: string;
    small: string;
  };
  sign?: string;
}

export function useBangumiUser(username: string | null) {
  return useQuery({
    queryKey: ['bangumi', 'user', username],
    queryFn: async () => {
      if (!username) throw new Error('Username required');
      
      const response = await fetch(`${API_BASE}/users/${username}`, {
        headers: {
          'User-Agent': 'bangumi-annual-report-2025/1.0',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user');
      }

      return response.json() as Promise<BangumiUser>;
    },
    enabled: !!username,
    staleTime: 1000 * 60 * 60,
  });
}

