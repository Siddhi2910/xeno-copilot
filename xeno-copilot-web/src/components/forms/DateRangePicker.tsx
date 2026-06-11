'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  className?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  className,
}: DateRangePickerProps) {
  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      <div className="space-y-1">
        <Label htmlFor="start-date" className="text-xs text-slate-500">
          Start
        </Label>
        <Input
          id="start-date"
          type="date"
          value={startDate}
          onChange={(e) => onStartChange(e.target.value)}
          className="w-36"
        />
      </div>
      <span className="pb-2 text-slate-400">—</span>
      <div className="space-y-1">
        <Label htmlFor="end-date" className="text-xs text-slate-500">
          End
        </Label>
        <Input
          id="end-date"
          type="date"
          value={endDate}
          onChange={(e) => onEndChange(e.target.value)}
          className="w-36"
        />
      </div>
    </div>
  );
}
