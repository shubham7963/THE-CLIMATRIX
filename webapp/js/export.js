// ---------------------------------------------------------------------------
// Generic table -> CSV export. Reads whatever is currently rendered in a
// <table>'s <thead>/<tbody> (so it always matches what the user sees,
// including badges/formatting reduced to plain text) and triggers a
// browser download. No backend involvement -- works even offline.
// ---------------------------------------------------------------------------
function exportTableToCsv(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) { toast('Nothing to export yet.', 'error'); return; }

  const rowsToCsvRow = (cells) => cells.map(cell => {
    let text = cell.textContent.trim().replace(/\s+/g, ' ');
    if (text.includes(',') || text.includes('"')) text = `"${text.replace(/"/g, '""')}"`;
    return text;
  }).join(',');

  const lines = [];
  const headerCells = table.querySelectorAll('thead tr th');
  if (headerCells.length) lines.push(rowsToCsvRow(Array.from(headerCells)));

  table.querySelectorAll('tbody tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length) lines.push(rowsToCsvRow(Array.from(cells)));
  });

  if (lines.length <= 1) { toast('No data in this table yet.', 'error'); return; }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV exported.');
}
