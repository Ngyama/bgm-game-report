import { Component, ErrorInfo, ReactNode, useEffect, useState, useMemo, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBangumiGames } from './hooks/useBangumiGames';
import { useBangumiUser } from './hooks/useBangumiUser';
import { 
  useSubjectsDetails, 
  calculateTagStats, 
  calculatePlatformStats,
  calculateGalgameStyleStats,
  calculateStaffStats
} from './hooks/useSubjectsTags';
import { GameCard } from './components/GameCard';
import { SummaryCard } from './components/SummaryCard';
import { Loader2, AlertCircle, ImageDown, Star } from 'lucide-react';
import { format } from 'date-fns';
import { cn, getProxiedUrl } from './lib/utils';
import { toPng } from 'html-to-image';
import { BangumiCollectionItem } from './types/bangumi';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const queryClient = new QueryClient();

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Something went wrong.</h1>
          <pre className="text-left bg-gray-100 p-4 rounded overflow-auto text-sm text-gray-700">
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function ListExportCard({ 
  username, 
  gamesByMonth, 
  sortedMonths,
  totalGames,
  generatedAt,
  cacheKey
}: { 
  username: string, 
  gamesByMonth: Record<string, BangumiCollectionItem[]>, 
  sortedMonths: number[],
  totalGames: number,
  generatedAt: string,
  cacheKey: number
}) {
  return (
    <div className="w-[1500px] bg-white p-8 rounded-[24px] shadow-xl border border-indigo-100 font-sans text-zinc-900 relative overflow-hidden">
        <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-br from-pink-500 to-indigo-500">
                2025 · Gaming Year
            </h1>
            <p className="text-zinc-500 text-lg mt-2">
                @{username} · 共标记 {totalGames} 款游戏
            </p>
            <p className="text-zinc-400 text-sm mt-1">
                生成时间：{generatedAt}
            </p>
        </div>

        <div className="flex flex-col gap-6">
            {sortedMonths.map(month => (
                <div key={month} className="grid grid-cols-[80px_1fr] gap-4 items-start">
                    <div className="text-5xl font-bold text-slate-300 leading-none tracking-wider text-center pt-1">
                        {String(month).padStart(2, '0')}
                    </div>
                    <div className="grid grid-cols-10 gap-3">
                        {gamesByMonth[String(month)].map((item, idx) => {
                            const imageUrl = getProxiedUrl(item.subject?.images?.common || item.subject?.images?.large || item.subject?.images?.medium);
                            return (
                                <div key={`${item.subject_id}-${idx}-${cacheKey}`} className="bg-white rounded-[12px] overflow-hidden border border-slate-200 shadow-sm flex flex-col h-[300px]">
                                    <div className="w-full h-[200px] relative bg-slate-100">
                                         <img 
                                            src={imageUrl}
                                            alt={item.subject?.name || ''} 
                                            className="w-full h-full object-cover block"
                                            crossOrigin="anonymous"
                                            loading="eager"
                                            key={`img-${cacheKey}-${item.subject_id}-${idx}`}
                                            decoding="async"
                                            data-subject-id={item.subject_id}
                                            data-index={idx}
                                         />
                                    </div>
                                    <div className="p-2 flex-grow flex flex-col justify-between">
                                        <div className="font-bold text-sm leading-snug text-zinc-800 line-clamp-2 mb-1">
                                            {item.subject?.name_cn || item.subject?.name}
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center text-[10px] text-slate-400">
                                                <span>{format(new Date(item.updated_at), 'MM-dd')}</span>
                                                {item.rate > 0 && (
                                                    <div className="flex items-center gap-0.5 text-yellow-500 font-bold">
                                                        <Star className="w-3 h-3 fill-current" />
                                                        {item.rate}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>

        <div className="text-right mt-8 text-slate-400 text-xs">
            Bangumi Annual Report Generator
        </div>
    </div>
  );
}

function UserGames() {
  const [username, setUsername] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'summary'>('list');
  const [summaryMode, setSummaryMode] = useState<'all' | 'galgame'>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportKey, setExportKey] = useState(0);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const user = params.get('user');
    if (user) {
      setUsername(user);
    }
  }, []);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error
  } = useBangumiGames(username);

  const { data: userData } = useBangumiUser(username);

  const games2025 = useMemo(() => {
    if (!data) return [];
    
    const allItems = data.pages.flatMap(page => page.data);
    const collectedGames = allItems.filter(item => item.type === 2); 
    
    return collectedGames.filter(item => {
      const date = new Date(item.updated_at);
      const year = date.getFullYear() === 2025;
      const itemId = `${item.subject_id}-${item.updated_at}`;
      const notDeleted = !deletedIds.has(itemId);
      return year && notDeleted;
    });
  }, [data, deletedIds]);

  const allGameIds = useMemo(() => games2025.map(g => g.subject_id), [games2025]);

  const { data: detailMap, isLoading: isLoadingDetails } = useSubjectsDetails(allGameIds);

  const summaryGames = useMemo(() => {
      if (summaryMode === 'all') return games2025;

      if (!detailMap) return games2025;

      return games2025.filter(g => {
          const detail = detailMap[g.subject_id];
          if (!detail) return false;
          return detail.tags.some(t => {
              const up = t.toUpperCase();
              return up === 'GALGAME' || up === 'ADV' || up === 'AVG' || up === 'VISUAL NOVEL';
          });
      });
  }, [games2025, summaryMode, detailMap]);

  const summaryGameIds = useMemo(() => summaryGames.map(g => g.subject_id), [summaryGames]);

  const summaryMonthlyCounts = useMemo(() => {
    const counts = Array.from({ length: 12 }, (_, idx) => ({
        month: idx + 1,
        label: `${idx + 1}月`,
        count: 0,
    }));
    summaryGames.forEach(item => {
        const month = new Date(item.updated_at).getMonth();
        counts[month].count += 1;
    });
    return counts;
  }, [summaryGames]);

  const radarData = useMemo(() => {
    if (!detailMap) return undefined;
    if (summaryMode === 'all') {
        return calculateTagStats(summaryGameIds, detailMap);
    } else {
        return calculateGalgameStyleStats(summaryGameIds, detailMap);
    }
  }, [detailMap, summaryGameIds, summaryMode]);

  const platformStats = useMemo(() => {
    if (!detailMap) return undefined;
    return calculatePlatformStats(summaryGameIds, detailMap);
  }, [detailMap, summaryGameIds]);

  const staffStats = useMemo(() => {
    if (!detailMap) return undefined;
    return calculateStaffStats(summaryGameIds, detailMap);
  }, [detailMap, summaryGameIds]);

  const gamesByMonth = useMemo(() => {
    const groups: Record<string, typeof games2025> = {};
    games2025.forEach(item => {
      const date = new Date(item.updated_at);
      const monthKey = (date.getMonth() + 1).toString();
      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }
      groups[monthKey].push(item);
    });
    return groups;
  }, [games2025]);

  const sortedMonths = useMemo(() => {
    return Object.keys(gamesByMonth)
      .map(Number)
      .sort((a, b) => b - a); 
  }, [gamesByMonth]);

  useEffect(() => {
    setDeletedIds(new Set());
  }, [username]);

  const handleDelete = (itemId: string) => {
    setDeletedIds(prev => {
      const newSet = new Set(prev);
      newSet.add(itemId);
      return newSet;
    });
  };

  const handleExportImage = async () => {
    if (!username) return;

    setExportError(null);
    setIsExporting(true);

    try {
        setExportKey(prev => prev + 1);
        await new Promise(resolve => setTimeout(resolve, 150));
        
        if (!exportRef.current) {
            throw new Error('导出组件初始化失败');
        }

        const container = exportRef.current;
        const images = Array.from(container.querySelectorAll('img'));
        const originalSrcs = images.map(img => img.src);

        await Promise.all(images.map(async (img) => {
            const src = img.src;
            if (!src || src.startsWith('data:')) return;
            try {
                const res = await fetch(src, { mode: 'cors' });
                const blob = await res.blob();
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(blob);
                });
                img.src = dataUrl;
            } catch (e) {
                console.warn('Inline image failed, keep original src', e);
            }
        }));

        const dataUrl = await toPng(container, {
            cacheBust: false,
            pixelRatio: 1.0,
            filter: () => true
        });

        images.forEach((img, idx) => {
            img.src = originalSrcs[idx];
        });

        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `bangumi-2025-${username}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to export image', err);
      setExportError(err instanceof Error ? err.message : '导出失败，请稍后重试');
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);

  const isStillLoading = isLoading || hasNextPage || isFetchingNextPage || (allGameIds.length > 0 && isLoadingDetails);

  if (!username) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
        <h1 className="text-4xl font-bold mb-4 text-pink-500">Bangumi 2025 Game Report</h1>
        <p className="text-zinc-600 mb-8">Please provide a user ID in the URL.</p>
        <div className="bg-zinc-100 p-4 rounded-lg font-mono text-sm">
          ?user=your_username
        </div>
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const input = form.elements.namedItem('username') as HTMLInputElement;
            if (input.value) {
                window.location.search = `?user=${input.value}`;
            }
          }}
          className="mt-8 flex gap-2"
        >
            <input 
                name="username" 
                placeholder="Enter Bangumi ID" 
                className="border p-2 rounded"
            />
            <button type="submit" className="bg-pink-500 text-white px-4 py-2 rounded">Go</button>
        </form>
      </div>
    );
  }
  
  if (isStillLoading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen">
            <Loader2 className="w-12 h-12 animate-spin text-pink-500 mb-4" />
            <p className="text-zinc-500 font-medium">Generating your annual report...</p>
            <div className="flex flex-col items-center gap-1 mt-2">
                 <p className="text-zinc-400 text-sm">{games2025.length} games loaded</p>
                 {allGameIds.length > 0 && !detailMap && (
                     <p className="text-zinc-400 text-xs animate-pulse">Analyzing game data...</p>
                 )}
            </div>
        </div>
    );
  }

  if (isError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-red-500">
          <AlertCircle className="w-12 h-12 mb-4" />
          <p>Failed to load collections.</p>
          <p className="text-sm mt-2 text-zinc-400">{(error as Error).message}</p>
        </div>
      );
  }

  return (
    <div className="w-[95%] max-w-[1800px] mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6 sticky top-4 z-50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-4 rounded-full shadow-sm border border-zinc-200 dark:border-zinc-800" data-export-ignore="true">
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-full">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
              viewMode === 'list' 
                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm" 
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            List
          </button>
          <button
            onClick={() => setViewMode('summary')}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
              viewMode === 'summary' 
                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm" 
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            Summary
          </button>
        </div>

        {viewMode === 'list' && (
          <div className="flex items-center gap-4">
            {exportError && (
              <span className="text-sm text-red-500 animate-pulse">
                {exportError}
              </span>
            )}
            <button
              onClick={handleExportImage}
              disabled={isExporting}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-5 py-2 text-sm font-medium shadow-sm hover:opacity-90 disabled:opacity-50 transition"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageDown className="w-4 h-4" />}
              {isExporting ? 'Generating Image...' : 'Export Image'}
            </button>
          </div>
        )}
      </div>

      <div className="absolute left-[-9999px] top-[-9999px] pointer-events-none">
         <div ref={exportRef} key={exportKey}>
             <ListExportCard 
                username={username}
                gamesByMonth={gamesByMonth}
                sortedMonths={sortedMonths}
                totalGames={games2025.length}
                generatedAt={format(new Date(), 'yyyy-MM-dd HH:mm')}
                cacheKey={exportKey}
             />
         </div>
      </div>

      <div ref={contentRef}>
      {viewMode === 'list' ? (
        <>
          <header className="mb-12 text-center">
            <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-600 mb-4">
              2025 年度游戏列表
            </h1>
            <div className="flex items-center justify-center gap-2 text-zinc-500">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">@{username}</span>
              <span>•</span>
              <span>共标记 {games2025.length} 款</span>
            </div>
          </header>

          {games2025.length === 0 && (
              <div className="text-center py-20 text-zinc-400">
                  No games found marked in 2025.
              </div>
          )}
          
          <div className="flex flex-col gap-12">
              {sortedMonths.map(month => (
                <div key={month} className="flex flex-col md:flex-row gap-6">
                  <div className="md:w-24 flex-shrink-0 pt-2">
                    <h2 className="text-3xl font-bold text-zinc-300 dark:text-zinc-600 sticky top-24">
                      {format(new Date(2025, month - 1, 1), 'MMM')}
                    </h2>
                  </div>
                   <div className="flex-grow grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
                    {gamesByMonth[String(month)].map(item => {
                      const itemId = `${item.subject_id}-${item.updated_at}`;
                      return (
                        <GameCard 
                          key={itemId} 
                          item={item} 
                          onDelete={() => handleDelete(itemId)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        </>
      ) : (
        <SummaryCard 
          user={userData} 
          username={username!} 
          games={summaryGames} 
          customRadarData={radarData}
          platformStats={platformStats}
          staffStats={staffStats}
          summaryMode={summaryMode}
          onToggleMode={() => setSummaryMode(prev => prev === 'all' ? 'galgame' : 'all')}
          monthlyCounts={summaryMonthlyCounts}
        />
      )}
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
          <UserGames />
        </div>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
