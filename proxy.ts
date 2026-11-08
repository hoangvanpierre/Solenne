import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Next 16 renamed the `middleware` file convention to `proxy` (same behaviour,
// now on the Node.js runtime by default). The session/cookie and route
// protection logic still lives in `lib/supabase/middleware.ts`.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public images, fonts, audio/video, manifests, and static assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|bmp|tiff|woff2?|ttf|eot|mp4|webm|webmanifest|txt|json|xml|map)$).*)',
  ],
};
