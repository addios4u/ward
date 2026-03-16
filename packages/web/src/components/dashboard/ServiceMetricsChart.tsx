import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export interface ServiceMetricsPoint {
  time: string;
  cpu: number | null;
  mem: number | null; // MB
}

interface ServiceMetricsChartProps {
  data: ServiceMetricsPoint[];
}

export function ServiceMetricsChart({ data }: ServiceMetricsChartProps) {
  const { t } = useTranslation();

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        {t('metrics.collecting')}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis yAxisId="cpu" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}%`} width={36} />
        <YAxis yAxisId="mem" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}M`} width={40} />
        <Tooltip
          formatter={(value: number, name: string) =>
            name === 'cpu' ? [`${value}%`, t('metrics.cpu')] : [`${value} MB`, t('metrics.memory')]
          }
        />
        <Legend formatter={(v: string) => (v === 'cpu' ? t('metrics.cpu') : t('metrics.memory'))} />
        <Line yAxisId="cpu" type="monotone" dataKey="cpu" stroke="#3b82f6" dot={false} strokeWidth={2} connectNulls />
        <Line yAxisId="mem" type="monotone" dataKey="mem" stroke="#10b981" dot={false} strokeWidth={2} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
