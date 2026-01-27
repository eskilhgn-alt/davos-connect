import * as React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { nb } from 'date-fns/locale';

interface DateSeparatorProps {
  date: Date;
}

export const DateSeparator: React.FC<DateSeparatorProps> = ({ date }) => {
  const getDateLabel = (d: Date): string => {
    if (isToday(d)) return 'I dag';
    if (isYesterday(d)) return 'I går';
    return format(d, 'dd.MM.yyyy', { locale: nb });
  };

  return (
    <div className="flex items-center justify-center py-4">
      <div className="flex-1 h-px bg-border" />
      <span className="px-3 text-xs font-body text-muted-foreground">
        {getDateLabel(date)}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
};
