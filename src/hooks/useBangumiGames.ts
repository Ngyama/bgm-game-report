import { useInfiniteQuery } from '@tanstack/react-query';
import { BangumiCollectionResponse } from '../types/bangumi';

const API_BASE = 'https://api.bgm.tv/v0';

export function useBangumiGames(username: string | null) {
  return useInfiniteQuery({
    queryKey: ['bangumi', 'games', username],
    queryFn: async ({ pageParam = 0 }) => {
      if (!username) throw new Error('Username required');
      
      const response = await fetch(
        `${API_BASE}/users/${username}/collections?subject_type=4&limit=30&offset=${pageParam}`,
        {
          headers: {
            'User-Agent': 'bangumi-annual-report-2025/1.0 (https://github.com/your-repo)',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const data: BangumiCollectionResponse = await response.json();
      return data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const nextOffset = allPages.length * 30;
      if (nextOffset >= lastPage.total) return undefined;
      
      return nextOffset;
    },
    enabled: !!username,
  });
}

