// Markdown content negotiation for page URLs. wrangler.jsonc runs this Worker
// first only for paths ending in "/" (the pages); everything else is served
// straight from public/. A request that prefers text/markdown over text/html
// gets the page's Markdown mirror (public/**/index.md, made by
// scripts/generate-markdown.js) at the same URL; everyone else gets the HTML.

// q-value the Accept header gives to `type`, matching type/* and */* too.
export function acceptQuality(accept, type) {
  const [major] = type.split('/');
  let best = { specificity: -1, q: 0 };
  for (const part of (accept ?? '').split(',')) {
    const [range, ...params] = part.trim().toLowerCase().split(';').map((s) => s.trim());
    if (!range) continue;
    const specificity = range === type ? 2 : range === `${major}/*` ? 1 : range === '*/*' ? 0 : -1;
    if (specificity <= best.specificity) continue;
    const qParam = params.find((p) => p.startsWith('q='));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    best = { specificity, q: Number.isFinite(q) ? q : 0 };
  }
  return best.q;
}

export function prefersMarkdown(accept) {
  const markdown = acceptQuality(accept, 'text/markdown');
  return markdown > 0 && markdown > acceptQuality(accept, 'text/html');
}

const withVary = (response) => {
  const out = new Response(response.body, response);
  out.headers.append('Vary', 'Accept');
  return out;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/') && prefersMarkdown(request.headers.get('Accept'))) {
      const mirror = await env.ASSETS.fetch(new Request(new URL(`${url.pathname}index.md`, url), request));
      if (mirror.ok) return withVary(mirror);
    }
    return withVary(await env.ASSETS.fetch(request));
  }
};
