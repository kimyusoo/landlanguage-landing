(function () {
  var PW_KEY = 'll_admin_pw';

  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso || ''; }
  }

  function esc(s) {
    var div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  function getPassword() {
    return sessionStorage.getItem(PW_KEY) || '';
  }

  function apiWithPassword(pw, path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    headers['x-admin-password'] = pw;
    return fetch(path, Object.assign({}, opts, { headers: headers }));
  }

  function api(path, opts) {
    return apiWithPassword(getPassword(), path, opts);
  }

  // ---- 비밀번호 게이트 ----
  var gate = document.getElementById('gate');
  var dashboard = document.getElementById('dashboard');
  var gateForm = document.getElementById('gateForm');
  var gatePassword = document.getElementById('gatePassword');
  var gateError = document.getElementById('gateError');

  function showDashboard() {
    gate.style.display = 'none';
    dashboard.style.display = 'block';
    loadAll();
  }

  function tryEnter(pw) {
    // 검증 전에는 sessionStorage에 쓰지 않습니다 — 여러 시도가 겹칠 때
    // 나중에 도착한 실패 응답이 먼저 성공한 로그인의 비밀번호를 지워버리는
    // 경쟁 조건을 막기 위함입니다.
    return apiWithPassword(pw, '/api/admin/stats').then(function (res) {
      if (res.status === 401) {
        gateError.style.display = 'block';
        return false;
      }
      sessionStorage.setItem(PW_KEY, pw);
      gateError.style.display = 'none';
      showDashboard();
      return true;
    }).catch(function () {
      gateError.textContent = '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';
      gateError.style.display = 'block';
      return false;
    });
  }

  gateForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = gatePassword.value.trim();
    if (!pw) return;
    tryEnter(pw);
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    sessionStorage.removeItem(PW_KEY);
    location.reload();
  });
  document.getElementById('refreshBtn').addEventListener('click', loadAll);

  // 이미 이번 세션에 입력한 비밀번호가 있으면 자동으로 재검증
  if (getPassword()) {
    tryEnter(getPassword());
  }

  // ---- 탭 ----
  var tabButtons = document.querySelectorAll('.tab-btn');
  Array.prototype.forEach.call(tabButtons, function (btn) {
    btn.addEventListener('click', function () {
      Array.prototype.forEach.call(tabButtons, function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (p) { p.classList.remove('active'); });
      document.getElementById('panel-' + btn.getAttribute('data-tab')).classList.add('active');
    });
  });

  // ---- 통계 ----
  function loadStats() {
    return api('/api/admin/stats').then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (result) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-stat]'), function (el) {
        if (!result.ok) { el.textContent = '오류'; el.title = result.d.error || ''; return; }
        var key = el.getAttribute('data-stat');
        el.textContent = (result.d[key] != null ? result.d[key] : '-');
        el.title = '';
      });
    });
  }

  // ---- 리드 ----
  function loadLeads() {
    var body = document.getElementById('leadsBody');
    return api('/api/admin/leads').then(function (r) { return r.json(); }).then(function (d) {
      var leads = d.leads || [];
      if (!leads.length) {
        body.innerHTML = '<tr><td colspan="6" style="color:#6B7280">아직 접수된 리드가 없습니다.</td></tr>';
        return;
      }
      body.innerHTML = leads.map(function (l) {
        return '<tr>' +
          '<td>' + esc(fmtDate(l.created_at)) + '</td>' +
          '<td>' + esc(l.name) + '</td>' +
          '<td>' + esc(l.company) + '</td>' +
          '<td>' + esc(l.phone) + '<br><span style="color:#6B7280">' + esc(l.email) + '</span></td>' +
          '<td>' + esc(l.email) + '</td>' +
          '<td style="max-width:320px;white-space:pre-wrap">' + esc(l.message) + '</td>' +
          '</tr>';
      }).join('');
    }).catch(function () {
      body.innerHTML = '<tr><td colspan="6" style="color:#B3261E">불러오기 실패</td></tr>';
    });
  }

  // ---- 리드 엑셀 다운로드 ----
  var exportBtn = document.getElementById('exportLeadsBtn');
  exportBtn.addEventListener('click', function () {
    var originalText = exportBtn.textContent;
    exportBtn.disabled = true;
    exportBtn.textContent = '생성 중...';
    api('/api/admin/leads-export')
      .then(function (res) {
        if (!res.ok) throw new Error('export failed: ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var today = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = 'leads_' + today + '.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(function () {
        alert('엑셀 파일을 만드는 중 오류가 발생했습니다. 다시 시도해 주세요.');
      })
      .finally(function () {
        exportBtn.disabled = false;
        exportBtn.textContent = originalText;
      });
  });

  // ---- 대화기록 ----
  function loadChats() {
    var list = document.getElementById('chatsList');
    return api('/api/admin/chat-logs').then(function (r) { return r.json(); }).then(function (d) {
      var sessions = d.sessions || [];
      if (!sessions.length) {
        list.innerHTML = '<div style="color:#6B7280;font-size:13.5px">아직 대화 기록이 없습니다.</div>';
        return;
      }
      list.innerHTML = sessions.map(function (s) {
        var bubbles = s.messages.map(function (m) {
          var isUser = m.role === 'user';
          var style = isUser
            ? 'align-self:flex-end;background:#C9713B;color:#fff;'
            : 'align-self:flex-start;background:#F6F4F0;color:#1B2A4A;';
          return '<div class="bubble" style="' + style + '">' + esc(m.content) + '</div>';
        }).join('');
        return '<div style="background:#fff;border-radius:14px;padding:18px;box-shadow:0 4px 16px rgba(27,42,74,0.06)">' +
          '<div style="font-size:12px;color:#6B7280;margin-bottom:10px">세션: ' + esc(s.sessionId) + ' · 마지막 대화 ' + esc(fmtDate(s.lastAt)) + '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px">' + bubbles + '</div>' +
          '</div>';
      }).join('');
    }).catch(function () {
      list.innerHTML = '<div style="color:#B3261E;font-size:13.5px">불러오기 실패</div>';
    });
  }

  // ---- 문서 ----
  function loadDocs() {
    var body = document.getElementById('docsBody');
    return api('/api/admin/documents').then(function (r) { return r.json(); }).then(function (d) {
      var sources = d.sources || [];
      if (!sources.length) {
        body.innerHTML = '<tr><td colspan="5" style="color:#6B7280">아직 적재된 문서가 없습니다.</td></tr>';
        return;
      }
      body.innerHTML = sources.map(function (s) {
        return '<tr>' +
          '<td>' + esc(s.source) + '</td>' +
          '<td>' + esc(s.chunkCount) + '</td>' +
          '<td>' + esc(s.totalChars.toLocaleString()) + '</td>' +
          '<td>' + esc(fmtDate(s.lastUpdated)) + '</td>' +
          '<td><button class="btn-danger" data-source="' + esc(s.source) + '">삭제</button></td>' +
          '</tr>';
      }).join('');
      Array.prototype.forEach.call(body.querySelectorAll('button[data-source]'), function (btn) {
        btn.addEventListener('click', function () {
          var source = btn.getAttribute('data-source');
          if (!confirm('"' + source + '" 문서의 모든 청크를 삭제할까요?')) return;
          api('/api/admin/documents?source=' + encodeURIComponent(source), { method: 'DELETE' })
            .then(function () { loadDocs(); loadStats(); });
        });
      });
    }).catch(function () {
      body.innerHTML = '<tr><td colspan="5" style="color:#B3261E">불러오기 실패</td></tr>';
    });
  }

  function loadAll() {
    loadStats();
    loadLeads();
    loadChats();
    loadDocs();
  }

  // ---- 파일 업로드 ----
  var dropzone = document.getElementById('dropzone');
  var fileInput = document.getElementById('fileInput');
  var uploadStatus = document.getElementById('uploadStatus');

  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('drag'); });
  dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropzone.classList.remove('drag');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
    fileInput.value = '';
  });

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = reader.result; // data:<mime>;base64,<data>
        var base64 = String(result).split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function handleFile(file) {
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['pdf', 'md', 'txt'].indexOf(ext) === -1) {
      uploadStatus.style.color = '#B3261E';
      uploadStatus.textContent = 'PDF, MD, TXT 파일만 업로드할 수 있습니다.';
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      uploadStatus.style.color = '#B3261E';
      uploadStatus.textContent = '파일이 너무 큽니다 (최대 3MB).';
      return;
    }
    uploadStatus.style.color = '#6B7280';
    uploadStatus.textContent = '"' + file.name + '" 업로드 및 임베딩 처리 중... (청크 수에 따라 시간이 걸릴 수 있습니다)';

    fileToBase64(file).then(function (base64) {
      return api('/api/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, fileBase64: base64 })
      });
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, data: data }; });
    }).then(function (result) {
      if (!result.ok) {
        uploadStatus.style.color = '#B3261E';
        uploadStatus.textContent = '업로드 실패: ' + (result.data.error || '알 수 없는 오류');
        return;
      }
      uploadStatus.style.color = '#1B2A4A';
      uploadStatus.textContent = '"' + result.data.filename + '" — ' + result.data.chunks + '개 청크 중 ' + result.data.saved + '개 저장 완료. 지식 기반에 반영되었습니다.';
      loadDocs();
      loadStats();
    }).catch(function () {
      uploadStatus.style.color = '#B3261E';
      uploadStatus.textContent = '업로드 중 오류가 발생했습니다. 다시 시도해 주세요.';
    });
  }
})();
