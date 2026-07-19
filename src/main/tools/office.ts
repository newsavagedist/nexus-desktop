import fs from 'node:fs/promises'
import ExcelJS from 'exceljs'
import PptxGenJS from 'pptxgenjs'
import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType } from 'docx'

// exceljs wants ARGB (8 hex digits); docx wants plain RGB (6 hex digits) — same colour, different formats.
const HEADER_FILL_ARGB = 'FFE5E0F5'
const HEADER_FILL_RGB = 'E5E0F5'

// ── Excel ─────────────────────────────────────────────────

export interface ExcelSheet {
  name: string
  headers?: string[]
  rows: (string | number | boolean | null)[][]
}

export interface CreateExcelArgs {
  path: string
  sheets: ExcelSheet[]
}

export async function createExcel({ path, sheets }: CreateExcelArgs): Promise<string> {
  const wb = new ExcelJS.Workbook()
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31))
    if (sheet.headers?.length) {
      ws.addRow(sheet.headers)
      const headerRow = ws.getRow(1)
      headerRow.font = { bold: true }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_ARGB } }
      ws.views = [{ state: 'frozen', ySplit: 1 }]
    }
    for (const row of sheet.rows) ws.addRow(row)
    // Auto-fit column widths from actual cell content, capped so one long
    // outlier doesn't blow up the sheet.
    ws.columns.forEach((col) => {
      let max = 10
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value ?? '').length
        if (len + 2 > max) max = len + 2
      })
      col.width = Math.min(max, 60)
    })
  }
  await fs.mkdir(pathDirname(path), { recursive: true })
  await wb.xlsx.writeFile(path)
  const totalRows = sheets.reduce((s, sh) => s + sh.rows.length, 0)
  return `Excel workbook written: ${path} (${sheets.length} sheet(s), ${totalRows} rows)`
}

// ── Word ──────────────────────────────────────────────────

export interface WordBlock {
  type: 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'bullet' | 'numbered' | 'table'
  text?: string
  rows?: string[][]
  headerRow?: boolean
}

export interface CreateWordArgs {
  path: string
  title?: string
  blocks: WordBlock[]
}

const HEADING_MAP: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  heading1: HeadingLevel.HEADING_1,
  heading2: HeadingLevel.HEADING_2,
  heading3: HeadingLevel.HEADING_3,
}

export async function createWord({ path, title, blocks }: CreateWordArgs): Promise<string> {
  const children: (Paragraph | Table)[] = []
  if (title) children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }))

  for (const block of blocks) {
    if (block.type === 'table' && block.rows?.length) {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: block.rows.map((row, ri) => new TableRow({
          children: row.map((cell) => new TableCell({
            width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
            shading: ri === 0 && block.headerRow ? { fill: HEADER_FILL_RGB } : undefined,
            children: [new Paragraph({
              children: [new TextRun({ text: cell, bold: ri === 0 && !!block.headerRow })],
            })],
          })),
        })),
      }))
      continue
    }
    if (block.type in HEADING_MAP) {
      children.push(new Paragraph({ text: block.text || '', heading: HEADING_MAP[block.type] }))
      continue
    }
    if (block.type === 'bullet') {
      children.push(new Paragraph({ text: block.text || '', bullet: { level: 0 } }))
      continue
    }
    if (block.type === 'numbered') {
      children.push(new Paragraph({ text: block.text || '', numbering: { reference: 'default-numbering', level: 0 } }))
      continue
    }
    children.push(new Paragraph({ text: block.text || '' }))
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{ level: 0, format: 'decimal', text: '%1.', style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      }],
    },
    sections: [{ children }],
  })

  await fs.mkdir(pathDirname(path), { recursive: true })
  const buffer = await Packer.toBuffer(doc)
  await fs.writeFile(path, buffer)
  return `Word document written: ${path} (${blocks.length} block(s))`
}

// ── PowerPoint ────────────────────────────────────────────

export interface PptSlide {
  title?: string
  bullets?: string[]
  notes?: string
}

export interface CreatePptArgs {
  path: string
  title?: string
  slides: PptSlide[]
}

export async function createPowerpoint({ path, title, slides }: CreatePptArgs): Promise<string> {
  const pres = new PptxGenJS()

  if (title) {
    const titleSlide = pres.addSlide()
    titleSlide.addText(title, { x: 0.5, y: 2.3, w: 9, h: 1.5, fontSize: 36, bold: true, align: 'center' })
  }

  for (const slide of slides) {
    const s = pres.addSlide()
    if (slide.title) {
      s.addText(slide.title, { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 26, bold: true })
    }
    if (slide.bullets?.length) {
      s.addText(
        slide.bullets.map((text) => ({ text, options: { bullet: true, breakLine: true } })),
        { x: 0.5, y: slide.title ? 1.3 : 0.5, w: 9, h: 5, fontSize: 18 },
      )
    }
    if (slide.notes) s.addNotes(slide.notes)
  }

  await fs.mkdir(pathDirname(path), { recursive: true })
  await pres.writeFile({ fileName: path })
  return `PowerPoint presentation written: ${path} (${slides.length} slide(s))`
}

// ── PDF (HTML → PDF via Electron's bundled Chromium) ────────
//
// PDFs are a layout format, not a data format like the other three — the
// model is far better at writing free-form HTML/CSS than filling a rigid
// content-block schema, and Electron already ships a full browser engine.
// No extra dependency: render the model's HTML off-screen and print it.

export interface CreatePdfArgs {
  path: string
  html: string
  landscape?: boolean
}

export async function createPdf({ path, html, landscape }: CreatePdfArgs): Promise<string> {
  const { BrowserWindow } = await import('electron')
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const buffer = await win.webContents.printToPDF({
      printBackground: true,
      landscape: !!landscape,
      pageSize: 'A4',
      preferCSSPageSize: true,
    })
    await fs.mkdir(pathDirname(path), { recursive: true })
    await fs.writeFile(path, buffer)
    return `PDF written: ${path}`
  } finally {
    win.destroy()
  }
}

function pathDirname(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return idx === -1 ? '.' : p.slice(0, idx)
}
