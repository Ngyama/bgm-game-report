import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const getProxiedUrl = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    return `${API_URL}/proxy/image?url=${encodeURIComponent(url)}`;
};
