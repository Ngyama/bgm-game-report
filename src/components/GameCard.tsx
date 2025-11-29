import { useState } from 'react';
import { BangumiCollectionItem } from '../types/bangumi';
import { format } from 'date-fns';
import { Eye, EyeOff, Star } from 'lucide-react';
import { cn } from '../lib/utils';

interface GameCardProps {
  item: BangumiCollectionItem;
}

export function GameCard({ item }: GameCardProps) {
  const { subject, rate, updated_at } = item;
  const date = new Date(updated_at);
  const [censored, setCensored] = useState(false);

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300 flex flex-col h-full border border-zinc-100 dark:border-zinc-700">
      <div className="relative aspect-[3/4] overflow-hidden group">
        <button
          type="button"
          onClick={() => setCensored(prev => !prev)}
          className="absolute top-2 left-2 z-10 bg-white/90 dark:bg-zinc-900/80 text-zinc-700 dark:text-zinc-200 rounded-full p-1.5 shadow-sm border border-zinc-100 dark:border-zinc-700 hover:shadow-md transition-all"
          data-export-ignore="true"
          aria-label={censored ? 'Reveal cover' : 'Hide cover'}
        >
          {censored ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <img
          src={subject.images.large || subject.images.common}
          alt={subject.name}
          className={cn(
            "w-full h-full object-cover transition-transform duration-500 group-hover:scale-105",
            censored && "blur-lg scale-100 brightness-75 saturate-50"
          )}
          loading="lazy"
        />
        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white px-2 py-1 rounded-md text-sm font-bold flex items-center gap-1">
          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
          <span>{rate > 0 ? rate : '-'}</span>
        </div>
      </div>
      
      <div className="p-4 flex flex-col flex-grow">
        <div className="mb-2 space-y-1">
          <div className="relative">
            <h3
              className={cn(
                "font-bold text-lg leading-tight text-zinc-900 dark:text-zinc-100 line-clamp-2 transition-colors",
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
                "text-xs text-zinc-500 truncate transition-colors",
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

        <div className="mt-auto pt-3 border-t border-zinc-100 dark:border-zinc-700 flex justify-between items-center text-xs text-zinc-400">
          <span>{format(date, 'yyyy-MM-dd')}</span>
        </div>
      </div>
    </div>
  );
}

