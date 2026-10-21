// NLEARN MASTER DOWNLOAD: EVERY MODULE ON YOUR DASHBOARD
// Open https://nlearn.nsbm.ac.lk/my/ (Dashboard), press F12, Console tab.
// Select ALL of this file (Ctrl+A), copy, paste into the Console, press Enter.
// A panel opens on the page listing every module. Untick any you do not want, press Start.
// Each module is read in the background and saved as its own zip in Downloads, the same
// zip the single-module script makes. Finished modules are ticked off and remembered, so
// if you stop or close the tab, running it again continues with the ones not done yet.
// Keep this tab open on the Dashboard until the panel says "All finished".

(async () => {
  const OPTIONS = {
    includeMySubmissions: true,   // also save files you uploaded to assignments, in a "My submission" folder
    includeHiddenCourses: false,  // true = also list modules you removed from view on the dashboard
    maxForumPages: 20,            // forum list pages to read per forum (each page lists many posts)
    pauseMs: 400,                 // wait between requests so the nlearn server is not flooded
    pauseBetweenModulesMs: 3000   // wait after each module zip is saved
  };
  const OPEN_ONLY = ['quiz', 'feedback', 'choice', 'choicegroup', 'questionnaire', 'attendance',
    'chat', 'survey', 'lti', 'scorm', 'workshop', 'data', 'glossary', 'wiki', 'lesson', 'h5pactivity', 'hvp', 'zoom'];

  if (window.__nlearnMaster) { console.warn('[nlearn] The master download is already open on this page.'); return; }
  window.__nlearnMaster = true;

  const host = location.host;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const clean = s => (s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 100) || 'untitled';
  const log = (...a) => console.log('%c[nlearn]', 'color:#1a73e8;font-weight:bold', ...a);
  const decode = s => { const t = document.createElement('textarea'); t.innerHTML = s || ''; return t.value; };

  // ---------- remembered progress (only in this browser) ----------
  const STORE = 'nlearnMasterDone';
  const loadDone = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
  const saveDone = d => { try { localStorage.setItem(STORE, JSON.stringify(d)); } catch {} };
  const done = loadDone();

  const saveBlob = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 120000);
  };

  // ---------- 1. get every module, the same way the dashboard "Course overview" does ----------
  const getCourses = async () => {
    const sesskey = window.M && M.cfg && M.cfg.sesskey;
    const kinds = OPTIONS.includeHiddenCourses ? ['allincludinghidden', 'all'] : ['all'];
    if (sesskey) {
      for (const classification of kinds) {
        try {
          const r = await fetch(`/lib/ajax/service.php?sesskey=${encodeURIComponent(sesskey)}&info=core_course_get_enrolled_courses_by_timeline_classification`, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{ index: 0, methodname: 'core_course_get_enrolled_courses_by_timeline_classification',
              args: { offset: 0, limit: 0, classification, sort: 'fullname' } }])
          });
          const j = await r.json();
          if (j[0] && !j[0].error && j[0].data && j[0].data.courses) {
            return j[0].data.courses.map(c => ({
              id: String(c.id), name: decode(c.fullname), category: decode(c.coursecategory || ''),
              url: c.viewurl || `${location.origin}/course/view.php?id=${c.id}`
            }));
          }
        } catch (e) { console.warn('[nlearn] Course list request failed, trying the page links instead.', e); }
      }
    }
    const map = new Map();
    document.querySelectorAll('a[href*="/course/view.php?id="]').forEach(a => {
      const id = (a.href.match(/id=(\d+)/) || [])[1];
      const name = a.textContent.replace(/\s+/g, ' ').trim();
      if (id && name && !map.has(id)) map.set(id, { id, name, category: '', url: `${location.origin}/course/view.php?id=${id}` });
    });
    return [...map.values()];
  };

  // ---------- 2. one module: exactly what the single-module script does ----------
  const downloadCourse = async (page, pageUrl, nameOverride) => {
    const host = location.host;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const clean = s => (s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 100) || 'untitled';
    const pad = n => String(n).padStart(2, '0');
    const log = (...a) => console.log('%c[nlearn]', 'color:#1a73e8;font-weight:bold', ...a);
    const extOf = n => (n.match(/\.[a-z0-9]{1,6}$/i) || [''])[0];
    const withParam = (u, p) => u + (u.includes('?') ? '&' : '?') + p;

    const courseName = nameOverride || clean((page.querySelector('.page-header-headings h1, #page-header h1, h1') || {}).textContent || page.title.replace(/^Course:\s*/i, ''));
    const files = [];
    const usedPaths = new Set();
    const seenFiles = new Set();
    const seenLinks = new Set();
    const links = {};
    const openInNlearn = [];
    const problems = [];
    let bytes = 0;

    // ---------- helpers ----------
    const getDoc = async url => {
      const r = await fetch(url, { credentials: 'include' });
      const type = r.headers.get('content-type') || '';
      if (!type.includes('text/html')) return { r };
      return { r, d: new DOMParser().parseFromString(await r.text(), 'text/html') };
    };

    const mainOf = d => {
      const m = d.querySelector('#region-main [role="main"], [role="main"], #region-main') || d.body;
      m.querySelectorAll('.activity_footer, .activity-navigation, .jumpnav, form.togglecompletion').forEach(e => e.remove());
      return m;
    };

    const harvest = (root, base) => {
      const pf = new Set(), ext = new Set();
      root.querySelectorAll('a[href], img[src], source[src], video[src], audio[src], iframe[src], object[data], embed[src]').forEach(e => {
        const raw = e.getAttribute('href') || e.getAttribute('src') || e.getAttribute('data');
        if (!raw || /^(#|javascript:|mailto:|tel:|data:)/i.test(raw)) return;
        let u;
        try { u = new URL(raw, base); } catch { return; }
        if (u.host === host) {
          if (u.pathname.includes('/pluginfile.php/') && !/\/(user|theme|core_admin|course\/overviewfiles)\//.test(u.pathname)) pf.add(u.href);
        } else if (/^https?:$/.test(u.protocol) && !/youtube\.com\/embed\/.*enablejsapi/.test(u.href)) {
          ext.add(u.href);
        }
      });
      root.querySelectorAll('[data-setup-lazy], [data-setup]').forEach(e => {
        try {
          JSON.parse(e.getAttribute('data-setup-lazy') || e.getAttribute('data-setup')).sources.forEach(s => s.src && ext.add(s.src));
        } catch {}
      });
      return { pf: [...pf], ext: [...ext] };
    };

    const isSubmission = u => /\/(assignsubmission_|assignfeedback_)/.test(u);

    // text kept for "All text and announcements.html"
    const texts = [];
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const cleanHtml = (node, base) => {
      if (!node) return '';
      const c = node.cloneNode(true);
      c.querySelectorAll('[data-setup-lazy], [data-setup]').forEach(v => {
        let src = '';
        try { src = JSON.parse(v.getAttribute('data-setup-lazy') || v.getAttribute('data-setup')).sources[0].src; } catch {}
        const box = v.closest('.mediaplugin') || v;
        box.outerHTML = src ? `<p>Video: <a href="${esc(src)}">${esc(src)}</a></p>` : '';
      });
      c.querySelectorAll('script, style, form, button, input, select, textarea, noscript, .accesshide, .sr-only, .activity_footer, .activity-navigation, .jumpnav, .togglecompletion, .actions-right, .commands, .post-actions, [data-region="post-actions-container"], .rating, .forum-post-footer').forEach(e => e.remove());
      c.querySelectorAll('[href], [src]').forEach(e => {
        ['href', 'src'].forEach(k => { const v = e.getAttribute(k); if (v && !/^(#|javascript:|mailto:|data:)/i.test(v)) try { e.setAttribute(k, new URL(v, base).href); } catch {} });
      });
      c.querySelectorAll('*').forEach(e => [...e.attributes].forEach(a => { if (!['href', 'src', 'alt', 'colspan', 'rowspan'].includes(a.name)) e.removeAttribute(a.name); }));
      const html = c.innerHTML.replace(/\s+/g, ' ').trim();
      return c.textContent.replace(/\s+/g, '').length || /<img/i.test(html) ? html : '';
    };
    const addText = (section, title, html) => { if (html) texts.push({ section, title, html }); };

    // forum: intro text, then every discussion with all its posts and attachments
    const saveForum = async (it, folder, base) => {
      const discussions = new Map();
      let intro = '';
      for (let p = 0; p < OPTIONS.maxForumPages; p++) {
        const { d } = await getDoc(withParam(it.href, `page=${p}`));
        if (!d) break;
        const m = mainOf(d);
        if (p === 0) intro = cleanHtml(m.querySelector('#intro, .forum-intro, .box.generalbox'), it.href);
        const before = discussions.size;
        m.querySelectorAll('a[href*="/mod/forum/discuss.php?d="]').forEach(a => {
          const id = (a.href.match(/d=(\d+)/) || [])[1];
          if (id && !discussions.has(id) && !a.closest('.lastpost, .author, td.lastpost')) discussions.set(id, { url: a.href.split('#')[0].replace(/&parent=\d+/, ''), title: a.textContent.trim() });
        });
        if (discussions.size === before) break;
        await wait(OPTIONS.pauseMs);
      }
      addText(it.section, `${it.title} (forum description)`, intro);
      if (!discussions.size) addText(it.section, it.title, '<p><i>No posts in this forum yet.</i></p>');
      let k = 0;
      for (const disc of discussions.values()) {
        k++;
        try {
          const { d } = await getDoc(disc.url);
          if (!d) continue;
          const m = mainOf(d);
          const subject = clean((m.querySelector('h2, h3') || {}).textContent || disc.title);
          let posts = [...m.querySelectorAll('[data-region="post"], div.forumpost')].filter(e => !e.parentElement.closest('[data-region="post"], div.forumpost'));
          const parts = posts.length ? posts : [m];
          const html = parts.map(e => {
            const inner = posts.length ? e.cloneNode(true) : e;
            if (posts.length) inner.querySelectorAll('[data-region="post"], div.forumpost, [data-region="replies-container"], .indent').forEach(x => x.remove());
            return `<div class="post">${cleanHtml(inner, disc.url)}</div>`;
          }).join('');
          // replies are nested inside posts, so collect them separately
          const replies = posts.length ? [...m.querySelectorAll('[data-region="post"], div.forumpost')].filter(e => e.parentElement.closest('[data-region="post"], div.forumpost')).map(e => {
            const r = e.cloneNode(true);
            r.querySelectorAll('[data-region="post"], div.forumpost, [data-region="replies-container"]').forEach(x => x.remove());
            return `<div class="post reply">${cleanHtml(r, disc.url)}</div>`;
          }).join('') : '';
          addText(it.section, `${it.title}: ${subject}`, html + replies);
          const found = harvest(m, disc.url);
          if (found.pf.length) await saveFileUrls(found.pf, folder, `${base}/${pad(k)} ${subject}`);
          found.ext.forEach(u => addLink(it.section, `Link in post: ${subject}`, u));
        } catch (e) {
          problems.push(`Could not read forum post "${disc.title}" (${disc.url}): ${e.message}`);
        }
        await wait(OPTIONS.pauseMs);
      }
    };

    const addLink = (section, title, url) => {
      if (seenLinks.has(url)) return;
      seenLinks.add(url);
      (links[section] = links[section] || []).push({ title, url });
    };

    const uniquePath = p => {
      if (!usedPaths.has(p.toLowerCase())) { usedPaths.add(p.toLowerCase()); return p; }
      const e = extOf(p), stem = p.slice(0, p.length - e.length);
      for (let i = 2; ; i++) {
        const q = `${stem} (${i})${e}`;
        if (!usedPaths.has(q.toLowerCase())) { usedPaths.add(q.toLowerCase()); return q; }
      }
    };

    const nameFrom = (r, fallback) => {
      const cd = r.headers.get('content-disposition') || '';
      const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="([^"]+)"/i) || cd.match(/filename=([^;]+)/i);
      if (m) { try { return decodeURIComponent(m[1].trim()); } catch { return m[1].trim(); } }
      try { return decodeURIComponent(new URL(r.url).pathname.split('/').pop()) || fallback; } catch { return fallback; }
    };

    const keepResponse = async (r, path) => {
      const blob = await r.blob();
      bytes += blob.size;
      files.push({ path: uniquePath(path), blob });
      log('Got', path, `(${(blob.size / 1048576).toFixed(1)} MB)`);
    };

    // folder: where to save. single: name to use if this is the only file of the item (no extension)
    const saveFileUrls = async (urls, folder, single) => {
      urls = urls.filter(u => !seenFiles.has(u.split('?')[0]));
      for (const u of urls) {
        seenFiles.add(u.split('?')[0]);
        try {
          const r = await fetch(u, { credentials: 'include' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const orig = clean(nameFrom(r, 'file'));
          const path = urls.length === 1 && single && !single.includes('/') ? `${single}${extOf(orig)}` : `${single ? single + '/' : ''}${orig}`;
          await keepResponse(r, `${folder}/${path}`);
        } catch (e) {
          problems.push(`Could not download ${u}: ${e.message}`);
        }
        await wait(OPTIONS.pauseMs);
      }
    };

    // ---------- 1. collect sections and items (also from separate section pages, if the course uses them) ----------
    const docs = [page];
    const sectionPages = [...new Set([...page.querySelectorAll('a[href*="course/view.php"][href*="section="]')]
      .map(a => a.href.split('#')[0]))].filter(h => h !== pageUrl.split('#')[0]);
    if (sectionPages.length && page.querySelectorAll('li.activity').length < 3) {
      for (const h of sectionPages) {
        try { const { d } = await getDoc(h); if (d) docs.push(d); } catch {}
        await wait(OPTIONS.pauseMs);
      }
    }

    const sectionOrder = [];
    const items = [];
    const seenModules = new Set();
    for (const d of docs) {
      d.querySelectorAll('li.section, [data-for="section"]').forEach(sec => {
        const h = sec.querySelector('.sectionname, h3, h4');
        const name = clean(h ? h.textContent : 'General');
        if (!sectionOrder.includes(name)) sectionOrder.push(name);
        sec.querySelectorAll('li.activity').forEach(li => {
          if (li.id && seenModules.has(li.id)) return;
          if (li.id) seenModules.add(li.id);
          const mod = (li.className.match(/modtype_(\w+)/) || [])[1] || 'unknown';
          const a = li.querySelector('.activityinstance a[href], a.aalink[href], .activityname a[href]');
          const nameEl = li.querySelector('.instancename');
          const title = clean(nameEl ? nameEl.firstChild.textContent : li.textContent.slice(0, 60));
          items.push({ li, mod, title, href: a ? a.href : null, section: name });
        });
        const summary = sec.querySelector('.summary, .section-summary, .summarytext');
        if (summary) items.push({ li: summary, mod: '_summary', title: 'Section description', href: null, section: name });
      });
    }
    const secFolder = s => `${pad(sectionOrder.indexOf(s) + 1)} ${s}`;
    const counters = {};
    log(`Found ${items.filter(i => i.mod !== '_summary').length} items in ${sectionOrder.length} sections. Working...`);

    // ---------- 2. go through every item ----------
    for (const it of items) {
      const folder = secFolder(it.section);
      const n = counters[folder] = (counters[folder] || 0) + (['_summary', 'label'].includes(it.mod) ? 0 : 1);
      const base = it.mod === '_summary' ? '' : `${pad(n)} ${it.title}`;

      // anything shown directly on the course page (labels, descriptions, embedded videos)
      const inline = harvest(it.li, pageUrl);
      inline.ext.forEach(u => addLink(it.section, it.mod === 'url' ? it.title : (it.mod === 'label' || it.mod === '_summary' ? 'Link in section text' : `Link in: ${it.title}`), u));
      if (inline.pf.length) await saveFileUrls(inline.pf, folder, it.mod === 'label' || it.mod === '_summary' ? '' : base);
      if (it.mod === 'label' || it.mod === '_summary') addText(it.section, it.mod === '_summary' ? 'Section description' : 'Text on the module page', cleanHtml(it.li, pageUrl));
      else if (it.mod !== 'forum') addText(it.section, `${it.title} (description)`, cleanHtml(it.li.querySelector('.contentafterlink, .activity-altcontent, .description'), pageUrl));

      if (!it.href || it.mod === 'label' || it.mod === '_summary') continue;

      try {
        if (it.mod === 'forum') {
          await saveForum(it, folder, base);
          continue;
        }
        if (OPEN_ONLY.includes(it.mod)) {
          openInNlearn.push({ section: it.section, title: `${it.title} (${it.mod})`, url: it.href });
          continue;
        }

        if (it.mod === 'resource') {
          const r = await fetch(withParam(it.href, 'redirect=1'), { credentials: 'include' });
          if ((r.headers.get('content-type') || '').includes('text/html')) {
            const d = new DOMParser().parseFromString(await r.text(), 'text/html');
            const found = harvest(mainOf(d), r.url);
            if (found.pf.length) await saveFileUrls(found.pf, folder, base);
            else problems.push(`No file found for "${it.title}" (${it.href})`);
          } else if (!seenFiles.has(r.url.split('?')[0])) {
            seenFiles.add(r.url.split('?')[0]);
            await keepResponse(r, `${folder}/${base}${extOf(clean(nameFrom(r, '')))}`);
          }
        } else if (it.mod === 'url') {
          const { d } = await getDoc(withParam(it.href, 'forceview=1'));
          const m = d && mainOf(d);
          const target = m && (m.querySelector('.urlworkaround a[href]') || {}).href;
          if (target) addLink(it.section, it.title, target);
          else if (m && harvest(m, it.href).ext.length) harvest(m, it.href).ext.forEach(u => addLink(it.section, it.title, u));
          else openInNlearn.push({ section: it.section, title: it.title, url: it.href });
        } else {
          // folder, assign, page, book, imscp and anything else: open it and take every file and link inside
          const { d } = await getDoc(it.href);
          if (!d) { problems.push(`"${it.title}" did not open as a page (${it.href})`); continue; }
          const m = mainOf(d);
          const found = harvest(m, it.href);
          if (it.mod === 'assign') addText(it.section, `${it.title} (instructions)`, cleanHtml(m.querySelector('#intro'), it.href));
          else if (it.mod === 'folder') addText(it.section, `${it.title} (folder description)`, cleanHtml(m.querySelector('#intro, .box.generalbox'), it.href));
          else addText(it.section, it.title, cleanHtml(m, it.href));
          const own = found.pf.filter(isSubmission);
          const material = found.pf.filter(u => !isSubmission(u));
          if (material.length) await saveFileUrls(material, folder, base);
          if (own.length && OPTIONS.includeMySubmissions) await saveFileUrls(own, folder, `${base}/My submission`);
          found.ext.forEach(u => addLink(it.section, `Link in: ${it.title}`, u));
          if (it.mod === 'book') openInNlearn.push({ section: it.section, title: `${it.title} (book, only first chapter checked)`, url: it.href });
        }
      } catch (e) {
        problems.push(`Failed on "${it.title}" (${it.href}): ${e.message}`);
      }
      await wait(OPTIONS.pauseMs);
    }

    // ---------- 3. write links.txt and report ----------
    let txt = `Links from: ${courseName}\nPage: ${pageUrl}\nSaved: ${new Date().toLocaleString()}\n`;
    for (const s of sectionOrder) {
      if (!links[s]) continue;
      txt += `\n== ${secFolder(s)} ==\n`;
      links[s].forEach(l => { txt += `${l.title}\n  ${l.url}\n`; });
    }
    if (openInNlearn.length) {
      txt += `\n== Activities to open in nlearn (quizzes, feedback forms...) ==\n`;
      openInNlearn.forEach(l => { txt += `[${l.section}] ${l.title}\n  ${l.url}\n`; });
    }
    const linkCount = Object.values(links).reduce((n, l) => n + l.length, 0);

    let textHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(courseName)}: text and announcements</title><style>
  body{font:16px/1.55 system-ui,Segoe UI,sans-serif;max-width:860px;margin:32px auto;padding:0 16px;color:#1d2330;background:#fff}
  h1{font-size:26px}h2{margin-top:40px;padding-bottom:6px;border-bottom:2px solid #1a73e8;font-size:21px}
  h3{font-size:16px;margin:24px 0 6px;color:#1a73e8}.box{border:1px solid #dde2ea;padding:12px 16px;margin-bottom:12px}
  .post{border-left:3px solid #1a73e8;padding:4px 12px;margin:8px 0}.reply{margin-left:28px;border-color:#9aa5b5}
  img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #dde2ea;padding:4px 8px}</style></head><body>
  <h1>${esc(courseName)}</h1><p>From <a href="${esc(pageUrl)}">${esc(pageUrl)}</a>, saved ${esc(new Date().toLocaleString())}. Images show only while you are logged in to nlearn.</p>`;
    for (const s of sectionOrder) {
      const list = texts.filter(t => t.section === s);
      if (!list.length) continue;
      textHtml += `<h2>${esc(secFolder(s))}</h2>`;
      list.forEach(t => { textHtml += `<h3>${esc(t.title)}</h3><div class="box">${t.html}</div>`; });
    }
    textHtml += '</body></html>';

    const reportTxt = `Files: ${files.length}\nLinks: ${linkCount}\nText blocks and posts: ${texts.length}\nTotal size: ${(bytes / 1048576).toFixed(1)} MB\n\nProblems:\n${problems.join('\n') || 'none'}\n`;

    return { courseName, files, txt, textHtml, reportTxt, problems, linkCount, textCount: texts.length, bytes };
  };

  // ---------- 3. the zip tool ----------
  let JSZip = null;
  try {
    const code = await (await fetch('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js')).text();
    const m = { exports: {} };
    new Function('module', 'exports', 'define', code)(m, m.exports, undefined);
    JSZip = m.exports;
  } catch (e) {
    console.warn('[nlearn] Zip tool could not load, files will be saved one by one instead.', e);
  }

  // ---------- 4. the panel ----------
  const courses = await getCourses();
  log(`Found ${courses.length} modules on the dashboard.`);

  const css = `#nlm{position:fixed;right:16px;bottom:16px;z-index:99999;width:440px;max-width:calc(100vw - 32px);max-height:80vh;display:flex;flex-direction:column;background:#fff;color:#1d2330;border:1px solid #c9d1dd;box-shadow:0 8px 28px rgba(0,0,0,.18);font:13px/1.4 system-ui,Segoe UI,sans-serif}
#nlm header{padding:10px 12px;background:#1a5fb4;color:#fff;font-weight:600;display:flex;justify-content:space-between;align-items:center}
#nlm header button{background:none;border:0;color:#fff;font-size:16px;cursor:pointer}
#nlm .bar{padding:8px 12px;border-bottom:1px solid #e3e8ef;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
#nlm .bar button{padding:4px 10px;border:1px solid #c9d1dd;background:#f5f7fa;cursor:pointer;font:inherit}
#nlm .bar button.go{background:#1a73e8;border-color:#1a73e8;color:#fff;font-weight:600}
#nlm .bar button:disabled{opacity:.5;cursor:default}
#nlm .status{padding:6px 12px;color:#4a5565;border-bottom:1px solid #e3e8ef}
#nlm .track{height:4px;background:#e3e8ef}#nlm .fill{height:4px;width:0;background:#1a73e8;transition:width .3s}
#nlm ul{list-style:none;margin:0;padding:0;overflow:auto}
#nlm li{display:flex;gap:8px;align-items:flex-start;padding:7px 12px;border-bottom:1px solid #f0f2f5}
#nlm li .t{flex:1}#nlm li .c{color:#6b7684;font-size:12px}#nlm li .s{font-size:12px;white-space:nowrap}
#nlm li.working{background:#eef4ff}#nlm li.ok .s{color:#137333}#nlm li.bad .s{color:#c5221f}#nlm li.prev .s{color:#6b7684}`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'nlm';
  panel.innerHTML = `<header><span>nlearn: download all modules</span><button title="Close">×</button></header>
    <div class="bar"><button data-a="all">Select all</button><button data-a="none">Select none</button><button data-a="new">Only not done</button>
    <button class="go" data-a="start">Start</button><button data-a="stop" disabled>Stop after this one</button><button data-a="reset">Forget progress</button></div>
    <div class="track"><div class="fill"></div></div><div class="status"></div><ul></ul>`;
  document.body.appendChild(panel);
  const $ = s => panel.querySelector(s);
  const status = t => { $('.status').textContent = t; };
  const rows = new Map();

  courses.forEach(c => {
    const li = document.createElement('li');
    li.innerHTML = '<input type="checkbox"><div class="t"><div class="n"></div><div class="c"></div></div><div class="s"></div>';
    li.querySelector('.n').textContent = c.name;
    li.querySelector('.c').textContent = c.category;
    const prev = done[c.id];
    li.querySelector('input').checked = !prev;
    if (prev) { li.className = 'prev'; li.querySelector('.s').textContent = `✓ done ${new Date(prev.at).toLocaleDateString()}`; }
    $('ul').appendChild(li);
    rows.set(c.id, li);
  });
  status(courses.length
    ? `${courses.length} modules found. ${Object.keys(done).filter(id => rows.has(id)).length} already done earlier. Untick any you do not want, then press Start.`
    : 'No modules found. Make sure you are on the Dashboard and logged in.');

  const setRow = (id, cls, text) => { const li = rows.get(id); li.className = cls; li.querySelector('.s').textContent = text; };
  let running = false, stopAsked = false;

  $('header button').onclick = () => {
    if (running) { status('Still running. Press "Stop after this one" first.'); return; }
    panel.remove(); style.remove(); window.__nlearnMaster = false;
  };

  panel.querySelector('.bar').onclick = async e => {
    const a = e.target.dataset && e.target.dataset.a;
    if (!a) return;
    if (a === 'all' || a === 'none') rows.forEach(li => { li.querySelector('input').checked = a === 'all'; });
    if (a === 'new') courses.forEach(c => { rows.get(c.id).querySelector('input').checked = !done[c.id]; });
    if (a === 'reset' && !running) {
      Object.keys(done).forEach(k => delete done[k]); saveDone(done);
      rows.forEach(li => { li.className = ''; li.querySelector('.s').textContent = ''; li.querySelector('input').checked = true; });
      status('Progress forgotten. Every module is selected again.');
    }
    if (a === 'stop') { stopAsked = true; e.target.disabled = true; status('Will stop after the current module finishes.'); }
    if (a === 'start' && !running) run();
  };

  const leaveGuard = e => { e.preventDefault(); e.returnValue = ''; };

  // ---------- 5. go through the selected modules one by one ----------
  const run = async () => {
    const todo = courses.filter(c => rows.get(c.id).querySelector('input').checked);
    if (!todo.length) { status('Nothing selected.'); return; }
    running = true; stopAsked = false;
    window.addEventListener('beforeunload', leaveGuard);
    panel.querySelectorAll('.bar button').forEach(b => { b.disabled = b.dataset.a !== 'stop'; });
    panel.querySelectorAll('li input').forEach(i => { i.disabled = true; });
    const summary = { ok: 0, bad: 0, files: 0, mb: 0 };

    for (let i = 0; i < todo.length; i++) {
      const c = todo[i];
      if (stopAsked) break;
      $('.fill').style.width = `${(i / todo.length) * 100}%`;
      status(`Module ${i + 1} of ${todo.length}: ${c.name}`);
      setRow(c.id, 'working', 'working...');
      rows.get(c.id).scrollIntoView({ block: 'nearest' });
      log(`===== Module ${i + 1} of ${todo.length}: ${c.name} =====`);
      try {
        const r = await fetch(c.url, { credentials: 'include' });
        if (/\/login\//.test(r.url)) throw new Error('nlearn logged you out. Log in again, open the Dashboard and run this again; finished modules are remembered.');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const page = new DOMParser().parseFromString(await r.text(), 'text/html');
        if (!page.querySelector('li.activity, li.section, [data-for="section"]')) throw new Error('module page has no sections (no access, or not open yet)');
        const zipName = clean(c.category ? `${c.category} - ${c.name}` : c.name);
        const res = await downloadCourse(page, r.url, zipName);

        if (JSZip) {
          setRow(c.id, 'working', 'packing zip...');
          const zip = new JSZip();
          const root = zip.folder(res.courseName);
          res.files.forEach(f => root.file(f.path, f.blob));
          root.file('links.txt', res.txt);
          root.file('All text and announcements.html', res.textHtml);
          root.file('_report.txt', res.reportTxt);
          saveBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `${res.courseName}.zip`);
        } else {
          for (const f of res.files) { saveBlob(f.blob, `${res.courseName} - ${f.path.replace(/\//g, ' - ')}`); await wait(700); }
          saveBlob(new Blob([res.txt], { type: 'text/plain' }), `${res.courseName} - links.txt`);
          saveBlob(new Blob([res.textHtml], { type: 'text/html' }), `${res.courseName} - All text and announcements.html`);
          saveBlob(new Blob([res.reportTxt], { type: 'text/plain' }), `${res.courseName} - report.txt`);
        }

        const mb = res.bytes / 1048576;
        done[c.id] = { at: Date.now(), name: c.name, files: res.files.length };
        saveDone(done);
        summary.ok++; summary.files += res.files.length; summary.mb += mb;
        setRow(c.id, 'ok', `✓ ${res.files.length} files, ${mb.toFixed(1)} MB${res.problems.length ? `, ${res.problems.length} problems` : ''}`);
        rows.get(c.id).querySelector('input').checked = false;
        if (res.problems.length) console.warn(`[nlearn] Problems in ${c.name}:\n` + res.problems.join('\n'));
      } catch (e) {
        summary.bad++;
        setRow(c.id, 'bad', '✗ failed');
        rows.get(c.id).title = e.message;
        console.error(`[nlearn] ${c.name} failed:`, e.message);
        if (/logged you out/.test(e.message)) { status(e.message); break; }
      }
      await wait(OPTIONS.pauseBetweenModulesMs);
    }

    running = false;
    window.removeEventListener('beforeunload', leaveGuard);
    $('.fill').style.width = '100%';
    panel.querySelectorAll('.bar button').forEach(b => { b.disabled = b.dataset.a === 'stop'; });
    panel.querySelectorAll('li input').forEach(i => { i.disabled = false; });
    const msg = `${stopAsked ? 'Stopped' : 'All finished'}: ${summary.ok} modules saved (${summary.files} files, ${summary.mb.toFixed(1)} MB)${summary.bad ? `, ${summary.bad} failed (hover the ✗ to see why; select them and press Start to retry)` : ''}.`;
    if (!/logged you out/.test($('.status').textContent)) status(msg);
    log(msg);
  };
})();
