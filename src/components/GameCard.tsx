import { useState } from 'react';
import { BangumiCollectionItem } from '../types/bangumi';
import { format } from 'date-fns';
import { Eye, EyeOff, Star, ThumbsUp, ThumbsDown, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface GameCardProps {
  item: BangumiCollectionItem;
  onDelete?: () => void;
}

export function GameCard({ item, onDelete }: GameCardProps) {
  const { subject, rate, updated_at } = item;
  const date = new Date(updated_at);
  const [censored, setCensored] = useState(false);
  const [recommended, setRecommended] = useState(false);
  const [notRecommended, setNotRecommended] = useState(false);

  const handleRecommend = () => {
    setRecommended(prev => !prev);
    if (!recommended) {
      setNotRecommended(false);
    }
  };

  const handleNotRecommend = () => {
    setNotRecommended(prev => !prev);
    if (!notRecommended) {
      setRecommended(false);
    }
  };

  return (
    <div className={cn(
      "bg-white dark:bg-zinc-800 rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col h-full border",
      recommended && "border-red-500 border-2",
      notRecommended && "border-black dark:border-zinc-100 border-2",
      !recommended && !notRecommended && "border-zinc-100 dark:border-zinc-700"
    )}>
      <div className="relative aspect-[3/4] overflow-hidden group">
        <div className="absolute top-1.5 left-1.5 z-10 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setCensored(prev => !prev)}
            className="bg-white/90 dark:bg-zinc-900/80 text-zinc-700 dark:text-zinc-200 rounded-full p-1 shadow-sm border border-zinc-100 dark:border-zinc-700 hover:shadow-md transition-all"
            data-export-ignore="true"
            aria-label={censored ? 'Reveal cover' : 'Hide cover'}
          >
            {censored ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </button>
          <button
            type="button"
            onClick={handleRecommend}
            className={cn(
              "rounded-full p-1 shadow-sm border hover:shadow-md transition-all",
              recommended 
                ? "bg-red-500 text-white border-red-500" 
                : "bg-white/90 dark:bg-zinc-900/80 text-zinc-700 dark:text-zinc-200 border-zinc-100 dark:border-zinc-700"
            )}
            data-export-ignore="true"
            aria-label={recommended ? '取消推荐' : '推荐'}
          >
            <ThumbsUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={handleNotRecommend}
            className={cn(
              "rounded-full p-1 shadow-sm border hover:shadow-md transition-all",
              notRecommended 
                ? "bg-black text-white border-black dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100" 
                : "bg-white/90 dark:bg-zinc-900/80 text-zinc-700 dark:text-zinc-200 border-zinc-100 dark:border-zinc-700"
            )}
            data-export-ignore="true"
            aria-label={notRecommended ? '取消不推荐' : '不推荐'}
          >
            <ThumbsDown className="w-3 h-3" />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('确定要删除这个游戏吗？')) {
                  onDelete();
                }
              }}
              className="bg-white/90 dark:bg-zinc-900/80 text-zinc-700 dark:text-zinc-200 rounded-full p-1 shadow-sm border border-zinc-100 dark:border-zinc-700 hover:shadow-md transition-all"
              data-export-ignore="true"
              aria-label="删除"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <img
          src={subject.images.large || subject.images.common}
          alt={subject.name}
          className={cn(
            "w-full h-full object-cover transition-transform duration-500 group-hover:scale-105",
            censored && "blur-lg scale-100 brightness-75 saturate-50"
          )}
          loading="lazy"
        />
        <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm text-white px-1.5 py-0.5 rounded text-xs font-bold flex items-center gap-0.5">
          <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
          <span>{rate > 0 ? rate : '-'}</span>
        </div>
      </div>
      
      <div className="p-2.5 flex flex-col flex-grow">
        <div className="mb-1.5 space-y-0.5">
          <div className="relative">
            <h3
              className={cn(
                "font-bold text-sm leading-tight text-zinc-900 dark:text-zinc-100 line-clamp-2 transition-colors",
                censored && "text-transparent select-none"
              )}
              title={subject.name}
            >
              {subject.name_cn || subject.name}
            </h3>
            {censored && (
              <span
                className="absolute inset-0 opacity-80 pointer-events-none rounded-md"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(0deg, rgba(113,113,122,0.45) 0 6px, rgba(244,244,245,0.55) 6px 12px)',
                  backdropFilter: 'blur(3px)',
                  mixBlendMode: 'multiply',
                }}
              />
            )}
          </div>
          <div className="relative">
            <p
              className={cn(
                "text-[10px] text-zinc-500 truncate transition-colors",
                censored && "text-transparent select-none"
              )}
            >
              {subject.name !== subject.name_cn ? subject.name : ''}
            </p>
            {censored && (
              <span
                className="absolute inset-0 opacity-75 pointer-events-none rounded"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(0deg, rgba(161,161,170,0.45) 0 4px, rgba(244,244,245,0.5) 4px 8px)',
                  backdropFilter: 'blur(2.5px)',
                  mixBlendMode: 'multiply',
                }}
              />
            )}
          </div>
        </div>

        <div className="mt-auto pt-2 border-t border-zinc-100 dark:border-zinc-700 flex justify-between items-center text-[10px] text-zinc-400">
          <span>{format(date, 'yyyy-MM-dd')}</span>
        </div>
      </div>
    </div>
  );
}

