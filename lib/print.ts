export function printRecord(title: string, rows: (string | number)[][]) {
  const escape = (s: string | number) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const page = window.open('', '_blank', 'width=800,height=900');
  if (!page) throw new Error('Allow pop-ups to open the printable receipt.');
  page.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title><style>body{font-family:Arial,sans-serif;margin:50px;color:#192c26}h1{font-size:26px}p{font-size:12px;color:#607069}table{border-collapse:collapse;width:100%;margin:30px 0}td{padding:12px 0;border-bottom:1px solid #e2e7df;font-size:13px}td:first-child{width:40%;color:#607069}button{padding:12px 20px;background:#234d3b;color:white;border:0;border-radius:5px}@media print{button{display:none}body{margin:20px}}</style></head><body><h1>${escape(title)}</h1><p>Riyasat · Payment acknowledgement</p><table>${rows.map(row => `<tr><td>${escape(row[0])}</td><td>${escape(row[1] ?? '')}</td></tr>`).join('')}</table><p>Recorded acknowledgement. Tax and legal treatment depend on the applicable agreement and jurisdiction.</p><button onclick="window.print()">Print / Save PDF</button></body></html>`);
  page.document.close(); page.opener = null;
}
