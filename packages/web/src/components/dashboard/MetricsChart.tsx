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
import type { Metric } from '@/types';

interface MetricsChartProps {
  metrics: Metric[];
}

// 메트릭 데이터를 차트용 형식으로 변환
function formatChartData(metrics: Metric[]) {
  return metrics.map((m) => ({
    time: new Date(m.collectedAt).toLocaleTimeString('ko-KR'),
    cpu: m.cpuUsage !== null ? Math.round(m.cpuUsage * 10) / 10 : null,
    mem:
      m.memTotal && m.memUsed
        ? Math.round((m.memUsed / m.memTotal) * 1000) / 10
        : null,
  }));
}

// CPU/메모리 라인 차트 컴포넌트
export function MetricsChart({ metrics }: MetricsChartProps) {
  const { t } = useTranslation();
  const data = formatChartData(metrics);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        {t('metrics.noData')}
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              `${value}%`,
              name === 'cpu' ? t('metrics.cpu') : t('metrics.memory'),
            ]}
          />
          <Legend
            formatter={(value: string) => (value === 'cpu' ? t('metrics.cpuUsage') : t('metrics.memoryUsage'))}
          />
          <Line
            type="monotone"
            dataKey="cpu"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={2}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="mem"
            stroke="#10b981"
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
