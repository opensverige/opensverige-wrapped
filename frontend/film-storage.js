export async function saveFilm(file, runId, csrf, format = 'editorial') {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const base = '/data/films/' + encodeURIComponent(runId) + '/' + digest + '/';
  const post = async action => {
    const response = await fetch(base + action, {
      method:'POST', body:new URLSearchParams({csrf, format, size:String(file.size)})
    });
    if (response.status === 401) throw new Error('Logga in igen för att spara filmen.');
    if (!response.ok) throw new Error('Filmen kunde inte sparas.');
    return response.json();
  };
  const ticket = await post('upload');
  if (ticket.saved) return;
  // Confirm even on a lost upload response. A previous attempt may already
  // have written the same immutable file.
  try {
    await fetch(ticket.url, {
      method:'PUT', credentials:'omit',
      headers:{'Content-Type':'video/mp4','x-vercel-blob-access':'private'},
      body:file
    });
  } catch { /* The server checks the uploaded file independently. */ }
  await post('confirm');
}
