import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Smile } from 'lucide-react';
import { cn } from '@/lib/utils';

const EMOJI_CATEGORIES = {
  'Ofte brukt': ['😊', '😂', '❤️', '👍', '🎉', '🔥', '⭐', '💯'],
  'Smileys': ['😀', '😃', '😄', '😁', '😅', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😗', '😙', '🥲'],
  'Gester': ['👋', '🤚', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '👍', '👎', '👏', '🙌'],
  'Hjerter': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
  'Vinter': ['❄️', '⛷️', '🎿', '🏂', '🌨️', '☃️', '⛄', '🏔️', '🗻', '🧣', '🧤', '🧥', '☕', '🍵'],
} as const;

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  children?: React.ReactNode;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, children }) => {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children || (
          <button
            type="button"
            className="tap-target p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
          >
            <Smile size={24} />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent 
        side="top" 
        align="start"
        className="w-72 p-2 max-h-64 overflow-y-auto"
      >
        {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
          <div key={category} className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-2 px-1">
              {category}
            </p>
            <div className="grid grid-cols-8 gap-1">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleSelect(emoji)}
                  className={cn(
                    "w-8 h-8 flex items-center justify-center text-lg",
                    "hover:bg-muted rounded transition-colors"
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
};
