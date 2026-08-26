(function () {
  var NAVY = '#1B2A4A';
  var AMBER = '#C9713B';
  var BG = '#F6F4F0';
  var SESSION_KEY = 'll_chat_session_id';

  function getSessionId() {
    try {
      var id = localStorage.getItem(SESSION_KEY);
      if (!id) {
        id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('sess-' + Date.now() + '-' + Math.random().toString(16).slice(2));
        localStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch (e) {
      return 'sess-' + Date.now();
    }
  }

  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'style') e.style.cssText = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (k === 'text') e.textContent = attrs[k];
        else e.setAttribute(k, attrs[k]);
      }
    }
    return e;
  }

  function buildWidget() {
    var launcher = el('button', {
      'aria-label': '상담 챗봇 열기',
      style: 'position:fixed;right:24px;bottom:24px;width:60px;height:60px;border-radius:50%;background:' + NAVY + ';color:#fff;border:none;box-shadow:0 8px 24px rgba(27,42,74,0.35);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:95;font-size:26px;transition:transform .15s,background .15s',
      html: '💬'
    });
    launcher.addEventListener('mouseover', function () { launcher.style.background = AMBER; });
    launcher.addEventListener('mouseout', function () { launcher.style.background = NAVY; });

    var panel = el('div', {
      style: 'display:none;flex-direction:column;position:fixed;right:24px;bottom:96px;width:min(360px, calc(100vw - 48px));height:min(520px, calc(100vh - 140px));background:#fff;border-radius:18px;box-shadow:0 20px 50px rgba(27,42,74,0.28);overflow:hidden;z-index:96;font-family:inherit'
    });

    var header = el('div', {
      style: 'background:' + NAVY + ';color:#fff;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0'
    });
    header.appendChild(el('div', { style: 'font-weight:700;font-size:15px', text: '랜드랭귀지 상담봇' }));
    var closeBtn = el('button', {
      'aria-label': '챗봇 닫기',
      style: 'background:none;border:none;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:0 4px',
      html: '&times;'
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var messagesEl = el('div', {
      style: 'flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:' + BG
    });
    panel.appendChild(messagesEl);

    var ctaBar = el('div', {
      style: 'padding:10px 16px;border-top:1px solid rgba(27,42,74,0.1);background:#fff;flex-shrink:0'
    });
    var ctaLink = el('a', {
      href: '#cta',
      style: 'display:block;text-align:center;color:' + AMBER + ';font-weight:600;font-size:13.5px'
    });
    ctaLink.textContent = '무료 상담 신청하기 →';
    ctaBar.appendChild(ctaLink);
    panel.appendChild(ctaBar);

    var form = el('form', {
      style: 'display:flex;gap:8px;padding:12px 16px 16px;border-top:1px solid rgba(27,42,74,0.08);background:#fff;flex-shrink:0'
    });
    var input = el('input', {
      type: 'text',
      placeholder: '궁금한 점을 물어보세요',
      autocomplete: 'off',
      style: 'flex:1;padding:10px 12px;border:1px solid rgba(27,42,74,0.18);border-radius:10px;font-size:14px;color:' + NAVY
    });
    var sendBtn = el('button', {
      type: 'submit',
      style: 'background:' + AMBER + ';color:#fff;border:none;border-radius:10px;padding:0 16px;font-weight:700;font-size:14px;cursor:pointer'
    });
    sendBtn.textContent = '전송';
    form.appendChild(input);
    form.appendChild(sendBtn);
    panel.appendChild(form);

    document.body.appendChild(panel);
    document.body.appendChild(launcher);

    function addMessage(role, text) {
      var isUser = role === 'user';
      var bubble = el('div', {
        style: 'max-width:82%;padding:10px 14px;border-radius:14px;font-size:14px;line-height:1.6;white-space:pre-wrap;' +
          (isUser
            ? 'align-self:flex-end;background:' + AMBER + ';color:#fff;border-bottom-right-radius:4px'
            : 'align-self:flex-start;background:#fff;color:' + NAVY + ';border-bottom-left-radius:4px;box-shadow:0 2px 8px rgba(27,42,74,0.08)')
      });
      bubble.textContent = text;
      messagesEl.appendChild(bubble);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return bubble;
    }

    function addTyping() {
      var bubble = addMessage('bot', '입력 중...');
      bubble.style.opacity = '0.6';
      return function remove() {
        if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
      };
    }

    var isOpen = false;
    var greeted = false;

    function openPanel() {
      isOpen = true;
      panel.style.display = 'flex';
      launcher.setAttribute('aria-expanded', 'true');
      if (!greeted) {
        greeted = true;
        addMessage('bot', '안녕하세요! 랜드랭귀지 상담봇입니다. 서비스·비용·계약 관련해 궁금한 점을 편하게 물어봐 주세요.');
      }
      setTimeout(function () { input.focus(); }, 50);
    }
    function closePanel() {
      isOpen = false;
      panel.style.display = 'none';
      launcher.setAttribute('aria-expanded', 'false');
    }

    launcher.addEventListener('click', function () {
      if (isOpen) closePanel(); else openPanel();
    });
    closeBtn.addEventListener('click', closePanel);
    ctaLink.addEventListener('click', closePanel);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      addMessage('user', text);
      input.value = '';
      input.disabled = true;
      sendBtn.disabled = true;
      var removeTyping = addTyping();

      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: getSessionId(), message: text })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('request failed: ' + res.status);
          return res.json();
        })
        .then(function (data) {
          removeTyping();
          addMessage('bot', data && data.reply ? data.reply : '죄송합니다, 답변을 가져오지 못했습니다.');
        })
        .catch(function () {
          removeTyping();
          addMessage('bot', '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주시거나, 위 "무료 상담 신청하기"를 이용해 주세요.');
        })
        .finally(function () {
          input.disabled = false;
          sendBtn.disabled = false;
          input.focus();
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildWidget);
  } else {
    buildWidget();
  }
})();
