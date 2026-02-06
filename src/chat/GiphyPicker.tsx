/**
 * GiphyPicker - Search and select GIFs from Giphy via proxy
 * Full-screen overlay with search and grid
 */

import * as React from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface GiphyPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

interface GiphyGif {
  id: string;
  images: {
    fixed_height: {
      url: string;
      width: string;
      height: string;
    };
    original: {
      url: string;
    };
  };
}

export const GiphyPicker: React.FC<GiphyPickerProps> = ({ onSelect, onClose }) => {
  const [query, setQuery] = React.useState('');
  const [gifs, setGifs] = React.useState<GiphyGif[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  React.useEffect(() => {
    loadTrending();
  }, []);

  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      loadTrending();
      return;
    }

    debounceRef.current = setTimeout(() => {
      searchGifs(query.trim());
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const fetchFromProxy = async (searchQuery?: string) => {
    const params: Record<string, string> = { limit: '20' };
    if (searchQuery) params.q = searchQuery;

    const queryString = new URLSearchParams(params).toString();
    const { data, error } = await supabase.functions.invoke('giphy-proxy', {
      body: null,
      headers: { 'Content-Type': 'application/json' },
      method: 'GET',
    });

    // supabase.functions.invoke doesn't support query params well, 
    // so we'll use fetch directly
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/giphy-proxy?${queryString}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });

    if (!response.ok) throw new Error('Failed to fetch GIFs');
    return response.json();
  };

  const loadTrending = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFromProxy();
      setGifs(data.data || []);
    } catch {
      setError('Kunne ikke laste GIFs');
    } finally {
      setLoading(false);
    }
  };

  const searchGifs = async (searchQuery: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFromProxy(searchQuery);
      setGifs(data.data || []);
    } catch {
      setError('Søk feilet');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (gif: GiphyGif) => {
    onSelect(gif.images.fixed_height.url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="flex-none flex items-center gap-3 px-4 py-3 border-b border-border safe-area-top">
        <button type="button" onClick={onClose} className="tap-target flex items-center justify-center -ml-2">
          <X size={24} />
        </button>
        <h1 className="font-heading text-lg font-semibold">Velg GIF</h1>
      </header>

      <div className="flex-none px-4 py-3 border-b border-border">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk etter GIFs..."
            className={cn(
              'w-full pl-10 pr-4 py-2.5 rounded-xl',
              'bg-muted border-none',
              'text-[16px]',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-primary'
            )}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain safe-area-bottom">
        {loading && gifs.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-destructive">{error}</div>
        ) : gifs.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            {query ? 'Ingen resultater' : 'Ingen GIFs tilgjengelig'}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1 p-1">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => handleSelect(gif)}
                className="aspect-square overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <img
                  src={gif.images.fixed_height.url}
                  alt="GIF"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-center py-4">
          <img
            src="https://giphy.com/static/img/poweredby_giphy.png"
            alt="Powered by GIPHY"
            className="h-4 opacity-60"
          />
        </div>
      </div>
    </div>
  );
};
