'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TimestampCell } from '@/components/shared/TimestampCell';
import { Button } from '@/components/ui/button';
import { useImportJobs } from '@/lib/hooks/useImportJobs';
import { ApiError } from '@/lib/types/api';
import { formatNumber } from '@/lib/utils/formatters';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/utils/queryKeys';

type ImportType = 'CUSTOMERS' | 'ORDERS';

async function uploadImport(type: ImportType, file: File): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);
  const res = await fetch('/api/proxy/import', { method: 'POST', body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new ApiError(res.status, 'UPLOAD_FAILED', body?.error?.message ?? `Upload failed (${res.status})`);
  }
}

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<ImportType>('CUSTOMERS');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useImportJobs(20);
  const jobs = data?.data ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Please select a CSV file.'); return; }
    setError(null);
    setSuccess(false);
    setUploading(true);
    try {
      await uploadImport(type, file);
      setSuccess(true);
      if (fileRef.current) fileRef.current.value = '';
      void queryClient.invalidateQueries({ queryKey: queryKeys.importJobs.all });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Import" subtitle="Upload CSV files to import customers or orders" />

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 font-medium text-slate-900 dark:text-slate-100">Upload CSV</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ImportType)}
              className="h-10 w-48 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="CUSTOMERS">Customers</option>
              <option value="ORDERS">Orders</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">CSV File</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-slate-300"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-emerald-600">Import started successfully.</p>}
          <Button type="submit" disabled={uploading}>
            {uploading ? 'Uploading…' : <><Upload className="h-4 w-4" /> Upload</>}
          </Button>
        </form>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 font-medium text-slate-900 dark:text-slate-100">Recent Imports</h2>
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-slate-500">No imports yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase text-slate-400 dark:border-slate-800">
                <th className="pb-2 pr-4">File</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Imported</th>
                <th className="pb-2 pr-4">Skipped</th>
                <th className="pb-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {jobs.map((job) => (
                <tr key={job._id}>
                  <td className="py-2 pr-4 font-medium">{job.filename}</td>
                  <td className="py-2 pr-4 text-slate-500">{job.type}</td>
                  <td className="py-2 pr-4"><StatusBadge status={job.status} /></td>
                  <td className="py-2 pr-4 tabular-nums">{formatNumber(job.imported)}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatNumber(job.skipped)}</td>
                  <td className="py-2"><TimestampCell iso={job.createdAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
