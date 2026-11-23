(() => {
  const canvas = document.querySelector('#poster');
  const ctx = canvas.getContext('2d');
  const actions = document.querySelector('#share-actions');
  const caption = document.querySelector('#caption');
  const demo = document.querySelector('#share').dataset.demo === 'yes';
  let textStats, voice;
  let completed = false;
  function label(value, x, y, size, color, weight = 600) {
    ctx.fillStyle = color;
    ctx.font = weight + ' ' + size + 'px "Segoe UI", sans-serif';
    ctx.fillText(value, x, y, 928);
  }
  function draw() {
    const paper = '#f9f6eb', moss = '#234b3c', rust = '#984e2f';
    ctx.fillStyle = moss;
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 1080, 570);
    ctx.clip();
    ctx.strokeStyle = '#63917a';
    ctx.lineWidth = 3;
    for (let radius = 85; radius < 620; radius += 23) {
      ctx.beginPath();
      ctx.ellipse(1070, 270, radius, radius * .71, -.8, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
    label('OpenSverige', 76, 106, 49, paper);
    label('Mitt år i', 72, 270, 110, paper);
    label('OpenSverige', 72, 384, 114, paper);
    label('WRAPPED   /   2026', 76, 500, 36, '#d7e5b2');
    ctx.fillStyle = paper;
    ctx.fillRect(0, 570, 1080, 780);
    const stats = textStats || {};
    const values = [[stats.days, 'dagar då jag skrev'], [stats.messages, 'inlägg i communityn'],
                    [stats.reactions, 'reaktioner på mina inlägg']];
    values.forEach(([value, description], index) => {
      const y = 720 + index * 174;
      label(value == null ? '…' : value.toLocaleString('sv-SE'), 76, y, 92, moss);
      label(description, 78, y + 50, 35, '#292d26', 400);
      ctx.fillStyle = '#d9d7c9';
      ctx.fillRect(76, y + 77, 928, 2);
    });
    const foot = voice ? voice + ' min i voice sedan 23 nov' : 'AI-agenter och språkmodeller';
    label(foot, 76, 1250, 34, rust);
    label(demo ? 'Exempelkort · påhittade siffror' : 'OpenSverige Wrapped · 2026 hittills', 76, 1301, 28, '#464d42', 400);
    canvas.setAttribute('aria-label', values.map(([n, desc]) => (n ?? '…') + ' ' + desc).join(', ') + '. ' + foot);
  }
  window.wrappedCard = {
    update(stats, ready) {
      textStats = stats;
      completed = ready;
      actions.hidden = !ready;
      if (ready) caption.value = (demo ? 'Exempel: ' : '') + 'Mitt 2026 i OpenSverige hittills: ' +
        stats.days + ' aktiva dagar och ' + stats.messages + ' inlägg om stort och smått i vår AI-community. #OpenSverige';
      draw();
    },
    setVoice(minutes) { voice = minutes; draw(); }
  };
  document.querySelector('#download-poster').onclick = () => {
    if (!completed) return;
    canvas.toBlob(blob => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = demo ? 'opensverige-exempelkort.png' : 'mitt-opensverige-2026.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    }, 'image/png');
  };
  document.querySelector('#copy-caption').onclick = async () => {
    const status = document.querySelector('#share-message');
    try { await navigator.clipboard.writeText(caption.value); status.textContent = 'Texten är kopierad.'; }
    catch { caption.select(); status.textContent = 'Texten är markerad. Kopiera den med tangentbordet.'; }
  };
  if (demo) window.wrappedCard.update({days:47,messages:183,reactions:96},true);
  else draw();
})();
