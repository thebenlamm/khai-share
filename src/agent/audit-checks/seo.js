'use strict';

async function run(ctx) {
  const pagesToCheck = ctx.profile.seoPages || [{ path: '/' }];

  for (const page of pagesToCheck) {
    const url = ctx.baseUrl + page.path;
    try {
      const res = await ctx._request(url);
      if (res.status !== 200) {
        ctx._addResult('seo', `${page.path}: Accessible`, 'fail', `Status ${res.status}`);
        continue;
      }

      const body = res.body;

      // Title tag
      const titleMatch = body.match(/<title[^>]*>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1].trim()) {
        const title = titleMatch[1].trim();
        if (title.length > 60) {
          ctx._addResult('seo', `${page.path}: Title length`, 'warn',
            `Title is ${title.length} chars (recommended: ≤60)`);
        } else {
          ctx._addResult('seo', `${page.path}: Has title`, 'pass', title);
        }
      } else {
        ctx._addResult('seo', `${page.path}: Has title`, 'fail', 'Missing <title> tag');
      }

      // Meta description
      const descMatch = body.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                        body.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
      if (descMatch && descMatch[1].trim()) {
        const desc = descMatch[1].trim();
        if (desc.length > 160) {
          ctx._addResult('seo', `${page.path}: Meta description length`, 'warn',
            `${desc.length} chars (recommended: ≤160)`);
        } else {
          ctx._addResult('seo', `${page.path}: Has meta description`, 'pass');
        }
      } else {
        ctx._addResult('seo', `${page.path}: Has meta description`, 'warn', 'Missing meta description');
      }

      // OG tags
      const ogTitle = body.match(/<meta[^>]*property=["']og:title["'][^>]*>/i);
      const ogDesc = body.match(/<meta[^>]*property=["']og:description["'][^>]*>/i);
      const ogImage = body.match(/<meta[^>]*property=["']og:image["'][^>]*>/i);

      if (ogTitle && ogDesc && ogImage) {
        ctx._addResult('seo', `${page.path}: Open Graph tags`, 'pass');
      } else {
        const missing = [];
        if (!ogTitle) missing.push('og:title');
        if (!ogDesc) missing.push('og:description');
        if (!ogImage) missing.push('og:image');
        ctx._addResult('seo', `${page.path}: Open Graph tags`, 'warn',
          `Missing: ${missing.join(', ')}`);
      }

      // Canonical
      const canonical = body.match(/<link[^>]*rel=["']canonical["'][^>]*>/i);
      if (canonical) {
        ctx._addResult('seo', `${page.path}: Canonical tag`, 'pass');
      } else {
        ctx._addResult('seo', `${page.path}: Canonical tag`, 'warn', 'Missing canonical link');
      }

      // H1 tag
      const h1Match = body.match(/<h1[^>]*>/i);
      if (h1Match) {
        ctx._addResult('seo', `${page.path}: Has H1`, 'pass');
      } else {
        ctx._addResult('seo', `${page.path}: Has H1`, 'warn', 'No H1 tag found');
      }

    } catch (err) {
      ctx._addResult('seo', `${page.path}: SEO check`, 'fail', err.message);
    }
  }
}

module.exports = { run };
