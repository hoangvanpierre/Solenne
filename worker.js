import worker from "./.open-next/worker.js";

export * from "./.open-next/worker.js";

export default {
  async fetch(request, env, ctx) {
    const response = await worker.fetch(request, env, ctx);

    // Modern browsers (Chrome, Edge, Safari) have removed HTTP/2 Server Push.
    // Cloudflare Edge automatically initiates HTTP/2 Server Push (cf-h2-pushed)
    // when it sees a 'Link' header with rel=preload, triggering NGHTTP2_PROTOCOL_ERROR
    // ("This page couldn't load. Reload to try again, or go back").
    //
    // Stripping the Link header prevents Cloudflare Edge from initiating Server Push.
    // The browser still parses and preloads styles and fonts normally from <head> tags in HTML.
    const link = response.headers.get("link");
    if (link && (link.includes("rel=preload") || link.includes('rel="preload"'))) {
      const headers = new Headers(response.headers);
      headers.delete("link");
      const body =
        response.status === 204 || response.status === 205 || response.status === 304
          ? null
          : response.body;

      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  },
};
