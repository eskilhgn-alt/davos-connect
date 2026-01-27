import * as React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageIcon, Search, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY;

interface GifResult {
  id: string;
  title: string;
  images: {
    fixed_height: {
      url: string;
      width: string;
      height: string;
    };
    fixed_height_still: {
      url: string;
    };
  };
}

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  children?: React.ReactNode;
}

export const GifPicker: React.FC<GifPickerProps> = ({ onSelect, children }) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [gifs, setGifs] = React.useState<GifResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const searchGifs = React.useCallback(async (searchQuery: string) => {
    if (!GIPHY_API_KEY) {
      setError('GIPHY API-nøkkel mangler');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const endpoint = searchQuery.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchQuery)}&limit=20&rating=g&lang=no`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=g`;

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch GIFs');
      
      const data = await response.json();
      setGifs(data.data || []);
    } catch (err) {
      console.error('GIF search error:', err);
      setError('Kunne ikke hente GIF-er');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  React.useEffect(() => {
    if (!open) return;
    
    const timer = setTimeout(() => {
      searchGifs(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, open, searchGifs]);

  // Load trending on open
  React.useEffect(() => {
    if (open && gifs.length === 0 && !loading && !error) {
      searchGifs('');
    }
  }, [open, gifs.length, loading, error, searchGifs]);

  const handleSelect = (gif: GifResult) => {
    onSelect(gif.images.fixed_height.url);
    setOpen(false);
    setQuery('');
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children || (
          <button
            type="button"
            className="tap-target p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
          >
            <ImageIcon size={24} />
          </button>
        )}
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[60vh] rounded-t-xl">
        <SheetHeader className="pb-4">
          <SheetTitle>Velg GIF</SheetTitle>
        </SheetHeader>

        {!GIPHY_API_KEY ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground">
            <AlertCircle size={48} className="mb-4 opacity-50" />
            <p className="font-medium">GIPHY ikke konfigurert</p>
            <p className="text-sm">Legg til VITE_GIPHY_API_KEY for GIF-støtte</p>
          </div>
        ) : (
          <>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                type="text"
                placeholder="Søk etter GIF..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="overflow-y-auto h-[calc(100%-100px)]">
              {loading ? (
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-video rounded-lg" />
                  ))}
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground">
                  <AlertCircle size={48} className="mb-4 opacity-50" />
                  <p>{error}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {gifs.map((gif) => (
                    <button
                      key={gif.id}
                      type="button"
                      onClick={() => handleSelect(gif)}
                      className={cn(
                        "relative overflow-hidden rounded-lg",
                        "hover:ring-2 hover:ring-primary transition-all",
                        "focus:outline-none focus:ring-2 focus:ring-primary"
                      )}
                    >
                      <img
                        src={gif.images.fixed_height.url}
                        alt={gif.title}
                        loading="lazy"
                        className="w-full h-auto object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
