import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/Badge';

describe('Badge 컴포넌트', () => {
  it('online 상태를 올바르게 렌더링해야 한다', () => {
    render(<Badge status="online" />);
    expect(screen.getByText('온라인')).toBeInTheDocument();
  });

  it('offline 상태를 올바르게 렌더링해야 한다', () => {
    render(<Badge status="offline" />);
    expect(screen.getByText('오프라인')).toBeInTheDocument();
  });

  it('unknown 상태를 올바르게 렌더링해야 한다', () => {
    render(<Badge status="unknown" />);
    expect(screen.getByText('알 수 없음')).toBeInTheDocument();
  });

  it('online 상태에 green 클래스가 적용되어야 한다', () => {
    render(<Badge status="online" />);
    const badge = screen.getByText('온라인');
    expect(badge.className).toContain('green');
  });

  it('offline 상태에 red 클래스가 적용되어야 한다', () => {
    render(<Badge status="offline" />);
    const badge = screen.getByText('오프라인');
    expect(badge.className).toContain('red');
  });
});
