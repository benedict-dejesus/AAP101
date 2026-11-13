/* ══════════════════════════════════════════════════════════════════════════
   AAP101 · GRADE CONSULTATION VIEW
   ──────────────────────────────────────────────────────────────────────────
   Renders one consultation record (from the server's `grades` action or the
   instructor's `consult.preview`) as HTML. Shared by the student portal and
   the instructor dashboard so both see exactly the same thing.

   Every value from the server is escaped. The server only ever returns the
   signed-in student's own record.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

(function () {

const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = { overall: '🎓', strength: '🌟', focus: '🎯', missing: '📌', trend: '📈', pending: '⏳',
               completion: '🧩', receiving: '🗂️', conditional: '⚖️', termOverall: '🎓' };

function tone(eq) {
  const n = Number(eq);
  if (!isFinite(n)) return 'gx-muted';
  if (n <= 2.25) return 'gx-good';
  if (n <= 3) return 'gx-ok';
  if (n <= 4) return 'gx-warn';
  return 'gx-bad';
}

function bar(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<span class="gx-bar"><i style="width:${p.toFixed(1)}%"></i></span>`;
}

function termHtml(t) {
  const items = t.items.map(it => `
      <tr class="${it.missing ? 'gx-miss' : ''}">
        <th scope="row">${h(it.label)}</th>
        <td>${it.count ? `<b>${h(it.score)}</b> absence${Number(it.score) === 1 ? '' : 's'} this semester` : it.missing ? '<span class="gx-tag">Not submitted</span>' : `<b>${h(it.score)}</b> / ${h(it.max)}`}</td>
      </tr>`).join('');
  const parts = t.parts.map(p => `
      <li><span class="gx-part-l">${h(p.label)} <em>${h(p.weight)}%</em></span>${bar(p.percent)}<b>${h(Math.round(p.percent * 100) / 100)}%</b></li>`).join('');
  return `
    <section class="gx-term">
      <header class="gx-term-h">
        <h3>${h(t.title)}</h3>
        <div class="gx-grade ${tone(t.equivalent)}"><b>${h(t.equivalent || '—')}</b><span>${h(t.grade || '')}</span></div>
      </header>
      ${parts ? `<ul class="gx-parts">${parts}</ul>` : ''}
      <details class="gx-items"><summary>Scores in this term</summary>
        <table><tbody>${items}</tbody></table>
      </details>
    </section>`;
}

function readingHtml(r) {
  const steps = (r.steps || []).length ? `<ol>${r.steps.map(s => `<li>${h(s)}</li>`).join('')}</ol>` : '';
  return `<div class="gx-read gx-${h(r.kind)}"><span class="gx-read-ico" aria-hidden="true">${ICON[r.kind] || '•'}</span>
    <div><h4>${h(r.heading)}</h4>${r.text ? `<p>${h(r.text)}</p>` : ''}${steps}</div></div>`;
}

/** HTML for one record. `opts.note` is the instructor's consultation note. */
function render(rec, opts) {
  opts = opts || {};
  if (!rec) return '';
  const who = `<div class="gx-who"><span>${h(rec.section || '')}</span><h2>${h(rec.fullName || '')}</h2></div>`;
  const note = opts.note ? `<div class="gx-note"><b>Note from your instructor</b><p>${h(opts.note)}</p></div>` : '';
  if (rec.status === 'pending') {
    return `<div class="gx">${who}${(rec.interpretation || []).map(readingHtml).join('')}${note}</div>`;
  }
  const fin = rec.final ? `
    <section class="gx-final ${tone(rec.final.fg)}">
      <div><span>Final rating</span><b>${h(rec.final.rating || '—')}</b></div>
      <div><span>Final grade</span><b>${h(rec.final.fg || '—')}</b></div>
      <div><span>Remarks</span><b>${h(rec.final.remarks || '—')}</b></div>
    </section>` : '';
  return `<div class="gx">
    ${who}
    ${fin}
    <div class="gx-terms">${(rec.terms || []).map(termHtml).join('')}</div>
    <div class="gx-reads">${(rec.interpretation || []).map(readingHtml).join('')}</div>
    ${note}
    ${rec.absences ? `<p class="gx-fine">Absences this semester: <b>${h(rec.absences.count)}</b>${rec.absences.limit ? ` (more than ${h(rec.absences.limit)} means you are dropped from the subject)` : ''}.</p>` : ''}
    <p class="gx-fine">Grading system: ${h(rec.policy || 'Quizzes 20% · Activities 20% · Projects 20% · Attendance 10% · Term Examinations 30%. Final rating = (Midterm + Final Term) ÷ 2.')} Equivalents follow the BulSU scale. If something looks wrong, message your instructor before the grades are submitted.</p>
  </div>`;
}

window.AAPGrades = { render, _tone: tone };

})();
