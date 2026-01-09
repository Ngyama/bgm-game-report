import { useQuery } from '@tanstack/react-query';
import pLimit from 'p-limit';

const TOKEN = 'KTxx43JasJ64QznYBwDfr2LCtEgVgHgdIt1hs7Gq';
const API_BASE = 'https://api.bgm.tv/v0';
const CONCURRENCY = 10;

export interface SubjectDetail {
  tags: string[];
  platform: string;
  infobox: {
    developers: string[];
    scenarists: string[];
  };
}

const limit = pLimit(CONCURRENCY);

const GENRE_TAGS = new Set([
  'Galgame', 'AAVG', 'ACT', 'ADV', 'ARPG', 'AVG', 'CCG', 'CRPG', 'DBG', 'DRPG', 
  'EDU', 'FPS', 'FTG', 'Fly', 'Horror', 'JRPG', 'MMORPG', 'MOBA', 'MUG', 'PUZ', 
  'Platform', 'RAC', 'RPG', 'RTS', 'RTT', 'Rhythm', 'Roguelike', 'SIM', 'SLG'
].map(t => t.toUpperCase()));

const GALGAME_STYLE_TAGS = new Set([
  '剧情', '纯爱', '恋爱', '校园', '悬疑', '治愈', '致郁', '科幻', '奇幻', 
  '战斗', '日常', '搞笑', '恐怖', '推理', '猎奇', '同人', '百合', 
  'NTR', '后宫', '其他', '泣系', '废萌'
]);

function parseInfobox(infobox: any[]) {
    const developers: string[] = [];
    const scenarists: string[] = [];

    if (!Array.isArray(infobox)) return { developers, scenarists };

    infobox.forEach(item => {
        const key = item.key;
        const val = item.value;

        if (['开发', '开发商', 'Developer'].includes(key)) {
            if (Array.isArray(val)) {
                val.forEach((v: any) => developers.push(v.v || v));
            } else {
                developers.push(val);
            }
        }

        if (['剧本', '脚本', 'Scenario', 'Writer'].includes(key)) {
             if (Array.isArray(val)) {
                val.forEach((v: any) => scenarists.push(v.v || v));
            } else {
                scenarists.push(val);
            }
        }
    });

    return { 
        developers: [...new Set(developers)],
        scenarists: [...new Set(scenarists)] 
    };
}

async function fetchSubjectDetails(subjectId: number): Promise<SubjectDetail> {
  const cacheKey = `bgm_subject_details_v3_${subjectId}`; 
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.tags) && parsed.infobox) return parsed;
    } catch (e) {
      localStorage.removeItem(cacheKey);
    }
  }

  try {
    const res = await fetch(`${API_BASE}/subjects/${subjectId}`, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'User-Agent': 'Lyra/BangumiAnnualReport',
      },
    });

    if (!res.ok) {
        return { tags: [], platform: 'Unknown', infobox: { developers: [], scenarists: [] } };
    }

    const data = await res.json();
    
    const tags = (data.tags || [])
      .slice(0, 10)
      .map((t: any) => t.name);
      
    const platform = data.platform || 'Unknown';
    const infoboxInfo = parseInfobox(data.infobox);
    
    const result = { tags, platform, infobox: infoboxInfo };
    localStorage.setItem(cacheKey, JSON.stringify(result));
    return result;
  } catch (error) {
    return { tags: [], platform: 'Unknown', infobox: { developers: [], scenarists: [] } };
  }
}

export function useSubjectsDetails(subjectIds: number[]) {
  return useQuery({
    queryKey: ['subjectsDetails', subjectIds.sort().join(',')],
    queryFn: async () => {
      if (subjectIds.length === 0) return {};
      
      const promises = subjectIds.map(id => 
        limit(async () => {
          const details = await fetchSubjectDetails(id);
          return { id, ...details };
        })
      );

      const results = await Promise.all(promises);
      
      const detailMap: Record<number, SubjectDetail> = {};
      results.forEach(r => {
        detailMap[r.id] = { 
            tags: r.tags, 
            platform: r.platform,
            infobox: r.infobox
        };
      });
      return detailMap;
    },
    enabled: subjectIds.length > 0,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function calculateTagStats(subjectIds: number[], detailMap: Record<number, SubjectDetail>) {
  const stats: Record<string, number> = {};
  
  subjectIds.forEach(id => {
    const detail = detailMap[id];
    if (!detail) return;
    
    for (const tag of detail.tags) {
      const upperTag = tag.toUpperCase();
      if (GENRE_TAGS.has(upperTag)) {
        stats[upperTag] = (stats[upperTag] || 0) + 1;
        break;
      }
    }
  });

  return formatRadarData(stats);
}

export function calculateGalgameStyleStats(subjectIds: number[], detailMap: Record<number, SubjectDetail>) {
    const stats: Record<string, number> = {};

    subjectIds.forEach(id => {
        const detail = detailMap[id];
        if (!detail) return;

        const isGalgame = detail.tags.some(t => {
            const up = t.toUpperCase();
            return up === 'GALGAME' || up === 'ADV' || up === 'AVG' || up === 'VISUAL NOVEL';
        });

        if (!isGalgame) return;

        const countedTags = new Set<string>(); 
        detail.tags.forEach(tag => {
            if (GALGAME_STYLE_TAGS.has(tag)) {
                 if (!countedTags.has(tag)) {
                     stats[tag] = (stats[tag] || 0) + 1;
                     countedTags.add(tag);
                 }
            }
        });
    });

    return formatRadarData(stats);
}

function formatRadarData(stats: Record<string, number>) {
    return Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag, count], index, arr) => {
        const maxVal = arr[0][1];
        return {
            subject: tag,
            A: (count / maxVal) * 100,
            fullMark: 100,
            count: count
        };
    });
}

export function calculatePlatformStats(subjectIds: number[], detailMap: Record<number, SubjectDetail>) {
  const stats: Record<string, number> = {};
  
  subjectIds.forEach(id => {
    const detail = detailMap[id];
    if (!detail || !detail.platform || detail.platform === 'Unknown') return;
    
    let plat = detail.platform;
    if (plat === 'PC') plat = 'Windows'; 
    stats[plat] = (stats[plat] || 0) + 1;
  });

  return Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
}

export function calculateStaffStats(subjectIds: number[], detailMap: Record<number, SubjectDetail>) {
    const devStats: Record<string, number> = {};
    const scnStats: Record<string, number> = {};

    subjectIds.forEach(id => {
        const detail = detailMap[id];
        if (!detail) return;

        detail.infobox.developers.forEach(dev => {
            devStats[dev] = (devStats[dev] || 0) + 1;
        });
        detail.infobox.scenarists.forEach(scn => {
            scnStats[scn] = (scnStats[scn] || 0) + 1;
        });
    });

    const getTop = (stats: Record<string, number>, n: number) => 
        Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, n);

    return {
        topDevelopers: getTop(devStats, 3),
        topScenarists: getTop(scnStats, 3)
    };
}
