// PDF export = browser print-to-PDF. The @media print rules in index.css hide
// the controls/header, force the light theme, and page-break between sections,
// so the printed output is the styled preview exactly. The browser seeds the
// PDF filename from document.title, so set it for the duration of the print.
export function exportPdf(filename) {
  const prev = document.title
  const restore = () => {
    document.title = prev
    window.removeEventListener('afterprint', restore)
  }
  window.addEventListener('afterprint', restore)
  if (filename) document.title = filename
  // Defer so the title change is committed before the print dialog opens.
  setTimeout(() => window.print(), 0)
}
