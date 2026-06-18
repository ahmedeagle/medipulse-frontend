import * as XLSX from 'xlsx'

export function useReportExport() {
  function exportToExcel(rows: Record<string, unknown>[], filename: string) {
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, `${filename}.xlsx`)
  }

  function exportToCsv(rows: Record<string, unknown>[], filename: string) {
    if (!rows.length) return
    const headers = Object.keys(rows[0])
    const lines = [
      headers.join(','),
      ...rows.map(row =>
        headers.map(h => {
          const val = String(row[h] ?? '')
          return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val
        }).join(',')
      ),
    ]
    const bom = '﻿'
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${filename}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function exportToPdf() {
    window.print()
  }

  return { exportToExcel, exportToCsv, exportToPdf }
}
