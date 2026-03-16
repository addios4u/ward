import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ServerCard } from '@/components/dashboard/ServerCard';
import type { Server } from '@/types';

const mockServer: Server = {
  id: 'test-uuid-1',
  name: '웹 서버 1',
  hostname: 'web-01.example.com',
  status: 'online',
  lastSeenAt: '2024-01-01T00:00:00Z',
  createdAt: '2024-01-01T00:00:00Z',
  groupName: null,
  publicIp: null,
  country: null,
  city: null,
  isp: null,
  osName: null,
  osVersion: null,
  arch: null,
  latestMetrics: null,
};

describe('ServerCard 컴포넌트', () => {
  it('서버 이름을 표시해야 한다', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ServerCard server={mockServer} /></MemoryRouter>);
    expect(screen.getByText('웹 서버 1')).toBeInTheDocument();
  });

  it('호스트명을 표시해야 한다', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ServerCard server={mockServer} /></MemoryRouter>);
    expect(screen.getByText('web-01.example.com')).toBeInTheDocument();
  });

  it('서버 상세 페이지로 연결되는 링크여야 한다', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ServerCard server={mockServer} /></MemoryRouter>);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/servers/test-uuid-1');
  });

  it('상태 뱃지가 표시되어야 한다', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ServerCard server={mockServer} /></MemoryRouter>);
    expect(screen.getByText('온라인')).toBeInTheDocument();
  });

  it('offline 서버의 상태 뱃지가 올바르게 표시되어야 한다', () => {
    const offlineServer = { ...mockServer, status: 'offline' as const };
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ServerCard server={offlineServer} /></MemoryRouter>);
    expect(screen.getByText('오프라인')).toBeInTheDocument();
  });

  it('latestMetrics가 있으면 CPU 사용률을 표시해야 한다', () => {
    const serverWithMetrics = {
      ...mockServer,
      latestMetrics: {
        cpuUsage: 45.2,
        memTotal: 8589934592,
        memUsed: 4294967296,
        diskUsage: null,
        loadAvg: null,
      },
    };
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ServerCard server={serverWithMetrics} /></MemoryRouter>);
    expect(screen.getByText('45.2%')).toBeInTheDocument();
  });

  it('latestMetrics가 있으면 메모리 사용량을 표시해야 한다', () => {
    const serverWithMetrics = {
      ...mockServer,
      latestMetrics: {
        cpuUsage: null,
        memTotal: 8589934592,
        memUsed: 4294967296,
        diskUsage: null,
        loadAvg: null,
      },
    };
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ServerCard server={serverWithMetrics} /></MemoryRouter>);
    // 4GB / 8GB 표시
    expect(screen.getByText(/4\.0.*GB/)).toBeInTheDocument();
  });

  it('osName과 osVersion이 있으면 OS 정보를 표시해야 한다', () => {
    const serverWithOs = { ...mockServer, osName: 'Ubuntu', osVersion: '22.04' };
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ServerCard server={serverWithOs} /></MemoryRouter>);
    expect(screen.getByText('Ubuntu 22.04')).toBeInTheDocument();
  });
});
