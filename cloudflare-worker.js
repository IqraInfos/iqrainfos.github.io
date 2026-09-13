const ALLOWED_ORIGIN = '*';

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders()
      });
    }

    const url = new URL(request.url);
    const fileId = url.searchParams.get('fileId') || '';
    const isThumbnail = url.searchParams.get('thumbnail') === '1';

    if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      return new Response('Invalid file ID', {
        status: 400,
        headers: corsHeaders()
      });
    }

    const driveUrl = isThumbnail
      ? new URL('https://drive.google.com/thumbnail')
      : new URL('https://drive.usercontent.google.com/download');
    driveUrl.searchParams.set('id', fileId);
    if (isThumbnail) {
      driveUrl.searchParams.set('sz', 'w400');
    } else {
      driveUrl.searchParams.set('export', 'download');
      driveUrl.searchParams.set('confirm', 't');
    }

    const upstreamHeaders = new Headers();
    const range = request.headers.get('Range');
    if (range) upstreamHeaders.set('Range', range);

    const upstream = await fetch(driveUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'follow'
    });

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range');
    responseHeaders.set('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, Content-Type');
    responseHeaders.set('Cache-Control', isThumbnail ? 'public, max-age=86400' : 'public, max-age=3600');
    if (!isThumbnail) responseHeaders.set('Accept-Ranges', 'bytes');

    if (!isThumbnail && (!responseHeaders.get('Content-Type') || responseHeaders.get('Content-Type') === 'application/octet-stream')) {
      responseHeaders.set('Content-Type', 'application/pdf');
    }

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type'
  };
}
