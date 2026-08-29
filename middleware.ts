import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // /admin 以下にアクセスしたときだけパスワードを要求する
  if (req.nextUrl.pathname.startsWith('/admin')) {
    const basicAuth = req.headers.get('authorization');

    if (basicAuth) {
      const authValue = basicAuth.split(' ')[1];
      const [user, pwd] = atob(authValue).split(':');

      // 環境変数に設定したIDとパスワードと照合
      if (user === process.env.BASIC_AUTH_USER && pwd === process.env.BASIC_AUTH_PASSWORD) {
        return NextResponse.next();
      }
    }

    // パスワードが間違っている、または入力されていない場合は入力画面を出す
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Secure Area"',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  // /admin 以下のすべてのページでこのロックを動かす
  matcher: ['/admin/:path*'],
};