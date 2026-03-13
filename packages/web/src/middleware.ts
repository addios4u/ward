import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // 세션 쿠키 존재 여부 확인 (쿠키 이름은 서버 설정과 일치: 'ward.sid')
  const sessionCookie = request.cookies.get('ward.sid')

  const isAuthPage = request.nextUrl.pathname.startsWith('/login')
  const isDashboard = !isAuthPage

  if (isDashboard && !sessionCookie) {
    // 인증 안 된 사용자를 로그인 페이지로 리다이렉트 (서버사이드에서 처리하므로 flash 없음)
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isAuthPage && sessionCookie) {
    // 이미 로그인한 사용자를 대시보드로 리다이렉트
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
