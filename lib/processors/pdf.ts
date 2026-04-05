import type { ExtractedContent } from '../types'

export async function processPdf(buffer: Buffer, filename: string): Promise<ExtractedContent> {
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)

  const title = deriveTitleFromFilename(filename)

  return {
    contentType: 'pdf',
    title,
    extractedText: data.text.trim(),
    pageCount: data.numpages,
  }
}

function deriveTitleFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '') // strip extension
    .replace(/[-_]/g, ' ')   // replace hyphens/underscores
    .replace(/\b\w/g, (c) => c.toUpperCase()) // title-case
}
