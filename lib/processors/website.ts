import type { ExtractedContent } from '../types'

const FETCH_TIMEOUT_MS = 10_000

export async function processWebsite(url: string): Promise<ExtractedContent> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let html: string
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LuminaReader/1.0)' },
    })
    html = await res.text()
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    throw new Error(isAbort ? 'FETCH_TIMEOUT' : 'FETCH_ERROR')
  } finally {
    clearTimeout(timer)
  }

  // Dynamic imports to keep these out of the edge runtime
  const { JSDOM } = await import('jsdom')
  const { Readability } = await import('@mozilla/readability')

  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()

  if (article && article.textContent) {
    return {
      contentType: 'website',
      title: article.title || new URL(url).hostname,
      extractedText: article.textContent.trim(),
      sourceUrl: url,
    }
  }

  // Fallback: raw textContent via cheerio
  const { load } = await import('cheerio')
  const $ = load(html)
  $('script, style, nav, header, footer, aside').remove()
  const text = $('body').text().replace(/\s+/g, ' ').trim()
  const titleText = $('title').text() || new URL(url).hostname

  return {
    contentType: 'website',
    title: titleText,
    extractedText: text,
    sourceUrl: url,
  }
}
