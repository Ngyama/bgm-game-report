import { useMemo, useRef, useState } from 'react';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { Calendar, Star, TrendingUp, User, ThumbsDown, ThumbsUp, Gamepad2, Monitor, BookOpen, PenTool, Building2, ImageDown, Loader2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { BangumiCollectionItem } from '../types/bangumi';
import { BangumiUser } from '../hooks/useBangumiUser';
import { cn } from '../lib/utils';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

const getProxiedUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    return `${API_URL}/proxy/image?url=${encodeURIComponent(url)}`;
};

interface StaffStats {
    topDevelopers: [string, number][];
    topScenarists: [string, number][];
}

interface SummaryCardProps {
  user: BangumiUser | undefined;
  username: string;
  games: BangumiCollectionItem[];
  customRadarData?: any[]; 
  platformStats?: [string, number][];
  staffStats?: StaffStats;
  summaryMode: 'all' | 'galgame';
  onToggleMode: () => void;
  monthlyCounts: { month: number; label: string; count: number }[];
}

export function SummaryCard({ 
    user, 
    username, 
    games, 
    customRadarData, 
    platformStats, 
    staffStats,
    summaryMode,
    onToggleMode,
    monthlyCounts
}: SummaryCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const totalGames = games.length;
  const ratedGames = games.filter(g => g.rate > 0);
  const totalScore = ratedGames.reduce((acc, curr) => acc + curr.rate, 0);
  const averageScore = ratedGames.length > 0 
    ? (totalScore / ratedGames.length).toFixed(1) 
    : '—';

  const newReleaseGames = useMemo(() => {
    return games.filter(g => {
        if (!g.subject.date) return false;
        return g.subject.date.startsWith('2025');
    });
  }, [games]);
  const newReleaseCount = newReleaseGames.length;
  const newReleasePercentage = totalGames > 0 ? Math.round((newReleaseCount / totalGames) * 100) : 0;

  const { mostActiveMonth } = useMemo(() => {
      if (games.length === 0) return { mostActiveMonth: null };

      const monthCounts: Record<string, number> = {};
      games.forEach(g => {
          const date = new Date(g.updated_at);
          const monthKey = date.toLocaleString('zh-CN', { month: 'short' }); 
          monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
      });

      let maxMonth = '';
      let maxVal = 0;
      Object.entries(monthCounts).forEach(([m, c]) => {
          if (c > maxVal) {
              maxVal = c;
              maxMonth = m;
          }
      });

      return {
          mostActiveMonth: { month: maxMonth, count: maxVal },
      };
  }, [games]);

  const { top5, bottom3 } = useMemo(() => {
    const sorted = [...ratedGames].sort((a, b) => b.rate - a.rate);
    const top = sorted.slice(0, 5); 
    const bottom = sorted.length >= 8 ? sorted.slice(-3).reverse() : []; 
    return { top5: top, bottom3: bottom };
  }, [ratedGames]);

  const fallbackRadarData = useMemo(() => {
      const quantityScore = Math.min(totalGames * 2, 100); 
      const qualityScore = ratedGames.length > 0 ? (parseFloat(averageScore as string) / 10) * 100 : 0;
      const newGameScore = newReleasePercentage; 
      const diversityScore = Math.min(new Set(games.map(g => new Date(g.updated_at).getMonth())).size * 10, 100); 
      const hardcoreScore = (ratedGames.filter(g => g.rate >= 8).length / (ratedGames.length || 1)) * 100; 

      return [
          { subject: '数量', A: quantityScore, fullMark: 100 },
          { subject: '口碑', A: qualityScore, fullMark: 100 },
          { subject: '新品', A: newGameScore, fullMark: 100 },
          { subject: '活跃', A: diversityScore, fullMark: 100 },
          { subject: '硬核', A: hardcoreScore, fullMark: 100 },
          { subject: '热爱', A: 80, fullMark: 100 }, 
      ];
  }, [totalGames, averageScore, newReleasePercentage, games, ratedGames]);

  const rawRadarData = customRadarData && customRadarData.length >= 3 ? customRadarData : fallbackRadarData;
  const isUsingFallback = !customRadarData || customRadarData.length < 3;

  const { isDominant, maxRawCount } = useMemo(() => {
    if (isUsingFallback) return { isDominant: false, maxRawCount: 100 };
    const counts = rawRadarData.map(d => d.count || 0);
    const max = Math.max(...counts);
    const sum = counts.reduce((a, b) => a + b, 0);
    const othersSum = sum - max;
    return { isDominant: max >= othersSum, maxRawCount: max };
  }, [rawRadarData, isUsingFallback]);

  const processedRadarData = useMemo(() => {
    if (isUsingFallback) return rawRadarData;
    if (maxRawCount === 0) return rawRadarData;

    return rawRadarData.map(d => {
        const val = d.count || 0;
        let normalized = 0;
        if (isDominant) {
            normalized = (Math.sqrt(val) / Math.sqrt(maxRawCount)) * 150;
        } else {
            normalized = (val / maxRawCount) * 100;
        }
        return { ...d, A: normalized, originalCount: val };
    });
  }, [rawRadarData, isUsingFallback, isDominant, maxRawCount]);

  const avatarUrl = user?.avatar?.large || user?.avatar?.medium;

  const handleExport = async () => {
    if (!cardRef.current) return;
    setIsExporting(true);
    try {
        const dataUrl = await toPng(cardRef.current, {
            cacheBust: true,
            pixelRatio: 2, 
            filter: (node) => {
                if (node.tagName === 'BUTTON') return false;
                return true;
            }
        });
        const link = document.createElement('a');
        link.download = `bangumi-summary-${username}-${summaryMode}.png`;
        link.href = dataUrl;
        link.click();
    } catch (err) {
        alert('导出失败，请重试');
    } finally {
        setIsExporting(false);
    }
  };

  return (
    <div className="flex justify-center w-full py-4 md:py-8">
        <div ref={cardRef} className="w-full max-w-7xl bg-white dark:bg-zinc-900 rounded-[3rem] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 relative transition-all duration-500 min-h-[1100px]">
            <div className={cn(
                "absolute inset-0 bg-gradient-to-br pointer-events-none transition-colors duration-500",
                summaryMode === 'galgame' 
                    ? "from-pink-100/50 via-rose-100/50 to-red-100/50 dark:from-pink-900/10 dark:via-rose-900/10 dark:to-red-900/10"
                    : "from-indigo-50/50 via-purple-50/50 to-pink-50/50 dark:from-indigo-900/10 dark:via-purple-900/10 dark:to-pink-900/10"
            )} />
            
            <div className="absolute top-8 right-8 z-20 flex gap-3">
                <button 
                    onClick={handleExport}
                    disabled={isExporting}
                    className="p-3 bg-white/80 dark:bg-black/20 backdrop-blur-md rounded-full shadow-lg border border-zinc-100 dark:border-zinc-700 hover:scale-110 transition-transform text-zinc-600 dark:text-zinc-300 group disabled:opacity-50 disabled:hover:scale-100"
                    title="导出图片"
                >
                    {isExporting ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImageDown className="w-6 h-6 group-hover:text-blue-500 transition-colors" />}
                </button>

                <button 
                    onClick={onToggleMode}
                    className="p-3 bg-white/80 dark:bg-black/20 backdrop-blur-md rounded-full shadow-lg border border-zinc-100 dark:border-zinc-700 hover:scale-110 transition-transform text-zinc-600 dark:text-zinc-300 group"
                    title={summaryMode === 'all' ? "切换到 Galgame 模式" : "切换到通用模式"}
                >
                    {summaryMode === 'all' ? (
                        <BookOpen className="w-6 h-6 group-hover:text-pink-500 transition-colors" />
                    ) : (
                        <Gamepad2 className="w-6 h-6 group-hover:text-indigo-500 transition-colors" />
                    )}
                </button>
            </div>
            
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-0">
                <div className="lg:col-span-4 bg-zinc-50/80 dark:bg-black/20 backdrop-blur-sm p-8 lg:p-12 flex flex-col border-r border-zinc-100 dark:border-zinc-800">
                    <div className="text-center mb-10">
                        <div className="w-40 h-40 mx-auto rounded-full overflow-hidden border-4 border-white dark:border-zinc-700 shadow-xl mb-6 ring-4 ring-purple-100 dark:ring-purple-900/30">
                            {avatarUrl ? (
                                <img src={getProxiedUrl(avatarUrl)} alt={username} className="w-full h-full object-cover" crossOrigin="anonymous" />
                            ) : (
                                <div className="w-full h-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                                    <User className="w-16 h-16 text-zinc-400" />
                                </div>
                            )}
                        </div>
                        <h2 className="text-4xl font-black text-zinc-800 dark:text-zinc-100 mb-3 tracking-tight">{user?.nickname || username}</h2>
                        <p className="text-zinc-500 font-mono text-base">@{username}</p>
                    </div>

                    <div className="space-y-6 flex-grow">
                         <div className="grid grid-cols-2 gap-4">
                             <div className="bg-white dark:bg-zinc-800 p-5 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-700 flex flex-col items-center justify-center gap-2 transition-transform hover:scale-[1.02]">
                                <Gamepad2 className={cn("w-8 h-8", summaryMode === 'galgame' ? "text-pink-500" : "text-blue-500")} />
                                <div className="text-3xl font-black text-zinc-800 dark:text-white">{totalGames}</div>
                                <div className="text-[10px] text-zinc-400 font-bold tracking-wider">
                                    {summaryMode === 'galgame' ? 'Galgame 数量' : '游戏数量'}
                                </div>
                             </div>
                             <div className="bg-white dark:bg-zinc-800 p-5 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-700 flex flex-col items-center justify-center gap-2 transition-transform hover:scale-[1.02]">
                                <Star className="w-8 h-8 text-yellow-500" />
                                <div className="text-3xl font-black text-zinc-800 dark:text-white">{averageScore}</div>
                                <div className="text-[10px] text-zinc-400 font-bold tracking-wider">平均分</div>
                             </div>
                         </div>

                         <div className="bg-white dark:bg-zinc-800 p-6 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-700">
                            <div className="flex justify-between items-end mb-3">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-green-500" />
                                    <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">2025 新游占比</span>
                                </div>
                                <span className="text-2xl font-black text-zinc-800 dark:text-white">{newReleasePercentage}%</span>
                            </div>
                            <div className="w-full h-3 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-gradient-to-r from-green-400 to-emerald-500" 
                                    style={{ width: `${newReleasePercentage}%` }}
                                />
                            </div>
                         </div>

                         <div className="min-h-[300px] flex flex-col gap-6">
                             {summaryMode === 'all' ? (
                                <>
                                     {mostActiveMonth && (
                                         <div className="bg-white dark:bg-zinc-800 p-5 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-700 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl text-purple-600">
                                                    <Calendar className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="text-xs text-zinc-400 font-bold">最活跃月份</div>
                                                    <div className="text-lg font-black text-zinc-800 dark:text-zinc-200">{mostActiveMonth.month}</div>
                                                </div>
                                            </div>
                                            <div className="text-2xl font-black text-zinc-300 dark:text-zinc-600">{mostActiveMonth.count}</div>
                                         </div>
                                     )}

                                     {platformStats && platformStats.length > 0 && (
                                         <div className="bg-white dark:bg-zinc-800 p-5 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-700">
                                            <div className="mb-4 flex items-center gap-2">
                                                <Monitor className="w-4 h-4 text-blue-400" />
                                            </div>
                                             <div className="space-y-4">
                                                 {platformStats.map(([plat, count], idx) => (
                                                     <div key={plat} className="space-y-1.5">
                                                         <div className="flex justify-between text-sm font-bold text-zinc-700 dark:text-zinc-200">
                                                             <span>{plat}</span>
                                                             <span className="text-zinc-400">{count}</span>
                                                         </div>
                                                         <div className="h-2 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                                                             <div 
                                                                 className={`h-full rounded-full ${
                                                                     idx === 0 ? 'bg-indigo-500' : 
                                                                     idx === 1 ? 'bg-indigo-400' : 
                                                                     'bg-indigo-300'
                                                                 }`}
                                                                 style={{ width: `${(count / totalGames) * 100}%` }}
                                                             />
                                                         </div>
                                                     </div>
                                                 ))}
                                             </div>
                                         </div>
                                     )}
                                </>
                             ) : (
                                <div className="flex flex-col gap-4">
                                    {staffStats && staffStats.topDevelopers.length > 0 && (
                                        <div className="bg-white dark:bg-zinc-800 p-5 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-700">
                                            <h4 className="text-[10px] text-zinc-400 font-bold mb-2 flex items-center gap-2 tracking-wider">
                                                <Building2 className="w-3 h-3" /> 厂牌 TOP3
                                            </h4>
                                            <div className="space-y-2">
                                                {staffStats.topDevelopers.map(([name, count]) => (
                                                    <div key={name} className="flex justify-between items-center text-sm">
                                                         <span className="font-bold text-zinc-700 dark:text-zinc-200 truncate pr-2">{name}</span>
                                                         <span className="font-mono text-zinc-400 text-xs">x{count}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {staffStats && staffStats.topScenarists.length > 0 && (
                                        <div className="bg-white dark:bg-zinc-800 p-5 rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-700">
                                            <h4 className="text-[10px] text-zinc-400 font-bold mb-2 flex items-center gap-2 tracking-wider">
                                                <PenTool className="w-3 h-3" /> 剧本 TOP3
                                            </h4>
                                            <div className="space-y-2">
                                                {staffStats.topScenarists.map(([name, count]) => (
                                                    <div key={name} className="flex justify-between items-center text-sm">
                                                         <span className="font-bold text-zinc-700 dark:text-zinc-200 truncate pr-2">{name}</span>
                                                         <span className="font-mono text-zinc-400 text-xs">x{count}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                             )}
                         </div>
                    </div>
                </div>

                <div className="lg:col-span-8 p-8 lg:p-12 flex flex-col">
                    <div className="mb-10">
                        <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 whitespace-nowrap">
                            2025 年度游戏总结
                        </h1>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-[2rem] p-6 flex flex-col items-center justify-center min-h-[380px] border border-zinc-100 dark:border-zinc-800 relative">
                            <h3 className="text-base font-bold text-zinc-400 tracking-widest mb-6">
                                {summaryMode === 'galgame' ? '题材偏好' : '类型偏好'}
                            </h3>
                            
                            <div className="w-full h-[380px] relative">
                                <ResponsiveContainer width="100%" height="100%" style={{ overflow: 'visible' }}>
                                    <RadarChart 
                                      cx="50%" 
                                      cy="50%" 
                                      outerRadius="55%" 
                                      data={processedRadarData || []}
                                      margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                                    >
                                        <PolarGrid stroke="#e5e7eb" />
                                        <PolarAngleAxis 
                                          dataKey="subject" 
                                          tick={{ fill: '#9ca3af', fontSize: 14, fontWeight: 600 }}
                                          axisLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
                                        />
                                        <PolarRadiusAxis 
                                          angle={90} 
                                          domain={[0, 100]} 
                                          tick={false} 
                                          axisLine={false} 
                                        />
                                        <Radar
                                            name="玩家"
                                            dataKey="A"
                                            stroke={summaryMode === 'galgame' ? "#ec4899" : "#8b5cf6"}
                                            strokeWidth={4}
                                            fill={summaryMode === 'galgame' ? "#ec4899" : "#8b5cf6"}
                                            fillOpacity={0.3}
                                        />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                             {isUsingFallback && (
                                <p className="text-sm text-zinc-400 mt-4">* 暂无足够的标签数据</p>
                             )}
                        </div>

                        <div>
                             <div className="flex items-center gap-3 mb-3">
                                <ThumbsUp className="w-6 h-6 text-red-500" />
                                <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-200">年度红榜</h3>
                             </div>
                             <div className="flex flex-col gap-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-[2rem] p-4 border border-zinc-100 dark:border-zinc-800">
                             {top5.map((game, idx) => (
                                <div key={game.subject_id} className="group relative overflow-hidden bg-white dark:bg-zinc-800 p-2 rounded-xl flex items-center gap-3 border border-zinc-200 dark:border-zinc-700 hover:border-red-200 dark:hover:border-red-900/30 transition-all hover:scale-[1.01] shadow-sm">
                                    <div className="w-10 h-14 rounded-lg bg-zinc-200 overflow-hidden flex-shrink-0 shadow-sm">
                                        <img src={getProxiedUrl(game.subject?.images?.common)} className="w-full h-full object-cover" alt="" crossOrigin="anonymous" />
                                    </div>
                                    <div className="flex-grow min-w-0 flex justify-between items-center pr-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded text-white ${
                                                    idx === 0 ? 'bg-red-500' : 
                                                    idx === 1 ? 'bg-red-400' : 
                                                    idx === 2 ? 'bg-red-300' : 
                                                    idx === 3 ? 'bg-orange-400' : 
                                                    'bg-orange-300'
                                                }`}>#{idx + 1}</span>
                                                <h4 className="font-bold text-zinc-700 dark:text-zinc-200 truncate text-sm">
                                                    {game.subject?.name_cn || game.subject?.name}
                                                </h4>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                                            <span className="font-black text-base text-zinc-700 dark:text-zinc-200">{game.rate}</span>
                                        </div>
                                    </div>
                                </div>
                             ))}
                             </div>
                        </div>
                    </div>

                    {bottom3.length > 0 && (
                        <div className="mt-2">
                            <div className="flex items-center gap-3 mb-3">
                                <ThumbsDown className="w-6 h-6 text-zinc-400" />
                                <h3 className="text-xl font-bold text-zinc-600 dark:text-zinc-400">年度黑榜</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-[2rem] p-4 border border-zinc-100 dark:border-zinc-800">
                                {bottom3.map((game) => (
                                    <div key={game.subject_id} className="group relative overflow-hidden bg-white dark:bg-zinc-800 p-2 rounded-xl flex items-center gap-3 border border-zinc-200 dark:border-zinc-700 opacity-80 hover:opacity-100 transition-all shadow-sm">
                                        <div className="w-10 h-14 rounded-lg bg-zinc-200 overflow-hidden flex-shrink-0 grayscale shadow-sm">
                                            <img src={getProxiedUrl(game.subject?.images?.common)} className="w-full h-full object-cover" alt="" crossOrigin="anonymous" />
                                        </div>
                                        <div className="flex-grow min-w-0 flex justify-between items-center pr-2">
                                            <div className="min-w-0">
                                                <h4 className="font-medium text-zinc-600 dark:text-zinc-400 truncate text-xs mb-1">
                                                    {game.subject?.name_cn || game.subject?.name}
                                                </h4>
                                                <div className="flex items-center gap-1">
                                                    <Star className="w-3.5 h-3.5 text-zinc-400 fill-zinc-400" />
                                                    <span className="font-bold text-sm text-zinc-500 dark:text-zinc-400">{game.rate}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {monthlyCounts && monthlyCounts.length > 0 && (
                        <div className="mt-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-[2rem] p-5 border border-zinc-100 dark:border-zinc-800">
                            <div className="flex items-center gap-3 mb-3">
                                <Calendar className="w-6 h-6 text-indigo-500" />
                                <h3 className="text-xl font-bold text-zinc-700 dark:text-zinc-200">活跃月份</h3>
                            </div>
                            <div className="w-full h-48">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={monthlyCounts} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                        <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                                        <YAxis allowDecimals={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                                        <defs>
                                            <linearGradient id="monthlyGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={summaryMode === 'galgame' ? '#ec4899' : '#6366f1'} stopOpacity={0.9} />
                                                <stop offset="100%" stopColor={summaryMode === 'galgame' ? '#f9a8d4' : '#c7d2fe'} stopOpacity={0.7} />
                                            </linearGradient>
                                        </defs>
                                        <Bar dataKey="count" fill="url(#monthlyGradient)" radius={[8, 8, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
}
