import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServerCard } from '@/components/dashboard/ServerCard';
import type { Server } from '@/types';

// next/link 모킹
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockServer: Server = {
  id: 'test-uuid-1',
  name: '웹 서버 1',
  hostname: 'web-01.example.com',
  status: 'online',
  lastSeenAt: '2024-01-01T00:00:00Z',
  createdAt: '2024-01-01T00:00:00Z',
};

describe('ServerCard 컴포넌트', () => {
  it('서버 이름을 표시해야 한다', () => {
    render(<ServerCard server={mockServer} />);
    expect(screen.getByText('웹 서버 1')).toBeInTheDocument();
  });

  it('호스트명을 표시해야 한다', () => {
    render(<ServerCard server={mockServer} />);
    expect(screen.getByText('web-01.example.com')).toBeInTheDocument();
  });

  it('서버 상세 페이지로 연결되는 링크여야 한다', () => {
    render(<ServerCard server={mockServer} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/servers/test-uuid-1');
  });

  it('상태 뱃지가 표시되어야 한다', () => {
    render(<ServerCard server={mockServer} />);
    expect(screen.getByText('온라인')).toBeInTheDocument();
  });

  it('offline 서버의 상태 뱃지가 올바르게 표시되어야 한다', () => {
    const offlineServer = { ...mockServer, status: 'offline' as const };
    render(<ServerCard server={offlineServer} />);
    expect(screen.getByText('오프라인')).toBeInTheDocument();
  });
});
