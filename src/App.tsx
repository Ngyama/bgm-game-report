import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBangumiGames } from './hooks/useBangumiGames';
import { GameCard } from './components/GameCard';
import { useEffect, useState, useMemo, useRef } from 'react';
import { Loader2, AlertCircle, ImageDown } from 'lucide-react';
import { toPng } from 'html-to-image';
import { format } from 'date-fns';

const queryClient = new QueryClient();

function UserGames() {
  const [username, setUsername] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  // 当 username 变化时，清空删除状态（每次加载都显示全部游戏）
  useEffect(() => {
    setDeletedIds(new Set());
  }, [username]);

  // 删除卡片的处理函数（只在当前会话有效，不持久化）
  const handleDelete = (itemId: string) => {
    setDeletedIds(prev => {
      const newSet = new Set(prev);
      newSet.add(itemId);
      return newSet;
    });
  };

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

  const games2025 = useMemo(() => {
    if (!data) return [];
    
    const allItems = data.pages.flatMap(page => page.data);
    const collectedGames = allItems.filter(item => item.type === 2); 
    
    return collectedGames.filter(item => {
      const date = new Date(item.updated_at);
      const year = date.getFullYear() === 2025;
      // 排除已删除的卡片
      const itemId = `${item.subject_id}-${item.updated_at}`;
      const notDeleted = !deletedIds.has(itemId);
      return year && notDeleted;
    });
  }, [data, deletedIds]);

  const gamesByMonth = useMemo(() => {
    const groups: Record<string, typeof games2025> = {};
    
    games2025.forEach(item => {
      const date = new Date(item.updated_at);
      const monthKey = date.getMonth().toString();
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

  const handleExportImage = async () => {
    if (!contentRef.current || !username) return;

    setExportError(null);
    setIsExporting(true);
    try {
      const dataUrl = await toPng(contentRef.current, {
        cacheBust: true,
        pixelRatio: window.devicePixelRatio || 2,
        filter: (node) => {
          if (node instanceof HTMLElement && node.dataset.exportIgnore === 'true') {
            return false;
          }
          return true;
        },
      });

      const link = document.createElement('a');
      link.download = `bangumi-2025-${username}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export image', err);
      setExportError('导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);

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

  return (
    <div className="w-[95%] max-w-[1800px] mx-auto px-4 py-8">
      <div className="flex justify-end mb-6" data-export-ignore="true">
        <button
          onClick={handleExportImage}
          disabled={isExporting}
          className="inline-flex items-center gap-2 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-5 py-2 text-sm font-medium shadow-sm hover:opacity-90 disabled:opacity-50 transition"
        >
          <ImageDown className="w-4 h-4" />
          {isExporting ? '导出中…' : '导出图片'}
        </button>
        {exportError && (
          <p className="text-sm text-red-500 mt-2 text-right w-full">
            {exportError}
          </p>
        )}
      </div>
      <div ref={contentRef}>
      <header className="mb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-600 mb-4">
          2025 Gaming Year
        </h1>
        <div className="flex items-center justify-center gap-2 text-zinc-500">
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">@{username}</span>
          <span>•</span>
          <span>{games2025.length} Games Marked</span>
        </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-pink-500" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-red-500">
          <AlertCircle className="w-12 h-12 mb-4" />
          <p>Failed to load collections.</p>
          <p className="text-sm mt-2 text-zinc-400">{(error as Error).message}</p>
        </div>
      ) : (
        <>
            {games2025.length === 0 && (
                <div className="text-center py-20 text-zinc-400">
                    No games found marked in 2025.
                </div>
            )}
            
            <div className="flex flex-col gap-12">
                {sortedMonths.map(month => (
                  <div key={month} className="flex flex-col md:flex-row gap-6">
                    <div className="md:w-24 flex-shrink-0 pt-2">
                      <h2 className="text-3xl font-bold text-zinc-300 dark:text-zinc-600 sticky top-4">
                        {format(new Date(2025, month, 1), 'MMM')}
                      </h2>
                    </div>
                     <div className="flex-grow grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
                      {gamesByMonth[month].map(item => {
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

            {isFetchingNextPage && (
                <div className="mt-12 text-center text-zinc-500 text-sm">
                    正在加载更多数据...
                </div>
            )}
        </>
      )}
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
        <UserGames />
      </div>
    </QueryClientProvider>
  );
}

export default App;

