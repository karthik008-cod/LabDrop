// ============================================================
// LabDrop AI Upgrades — Viva Drill Mode & Vision Analysis
// ============================================================

(function () {
  'use strict';

  // ============================================================
  // Upgrade 2: Interactive Viva Drill Mode
  // ============================================================

  const DRILL_STYLES = `
#vivaDrillPanel {
  position: fixed;
  bottom: 90px;
  right: 20px;
  width: 360px;
  max-width: calc(100vw - 32px);
  background: var(--color-bg, #fff);
  border: 1.5px solid var(--color-primary, #f59e0b);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  z-index: 9000;
  display: none;
  flex-direction: column;
  overflow: hidden;
  font-family: inherit;
}
#vivaDrillPanel.open { display: flex; }
.drill-header {
  background: var(--color-primary, #f59e0b);
  color: #111;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  font-size: 0.95rem;
}
.drill-header button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  padding: 2px 6px;
  color: #111;
  border-radius: 4px;
}
.drill-header button:hover { background: rgba(0,0,0,0.1); }
.drill-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  max-height: 460px;
}
.drill-setup { display: flex; flex-direction: column; gap: 10px; }
.drill-setup input {
  width: 100%; box-sizing: border-box;
  padding: 9px 12px;
  border: 1.5px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  font-size: 0.9rem;
  background: var(--color-bg, #fff);
  color: var(--color-text, #111);
}
.drill-setup input:focus { outline: none; border-color: var(--color-primary, #f59e0b); }
.drill-start-btn {
  background: var(--color-primary, #f59e0b);
  color: #111;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.9rem;
  transition: opacity 0.15s;
}
.drill-start-btn:hover { opacity: 0.85; }
.drill-start-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.drill-progress {
  font-size: 0.78rem;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  letter-spacing: 0.03em;
}
.drill-progress-bar {
  height: 4px;
  background: var(--color-border, #e5e7eb);
  border-radius: 99px;
  overflow: hidden;
}
.drill-progress-fill {
  height: 100%;
  background: var(--color-primary, #f59e0b);
  border-radius: 99px;
  transition: width 0.4s ease;
}
.drill-question-card {
  background: var(--color-surface, #f9fafb);
  border: 1.5px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  padding: 14px;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.5;
  color: var(--color-text, #111);
}
.drill-answer-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.drill-answer-area textarea {
  width: 100%; box-sizing: border-box;
  padding: 10px 12px;
  border: 1.5px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  font-size: 0.9rem;
  resize: vertical;
  min-height: 80px;
  background: var(--color-bg, #fff);
  color: var(--color-text, #111);
  font-family: inherit;
}
.drill-answer-area textarea:focus { outline: none; border-color: var(--color-primary, #f59e0b); }
.drill-submit-btn {
  background: var(--color-primary, #f59e0b);
  color: #111;
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.88rem;
  transition: opacity 0.15s;
  align-self: flex-end;
}
.drill-submit-btn:hover { opacity: 0.85; }
.drill-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.drill-feedback {
  background: var(--color-surface, #f9fafb);
  border-radius: 10px;
  border: 1.5px solid var(--color-border, #e5e7eb);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.drill-score-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--color-primary, #f59e0b);
  color: #111;
  font-weight: 800;
  font-size: 0.88rem;
  border-radius: 20px;
  padding: 3px 10px;
}
.drill-score-badge.low { background: #ef4444; color: #fff; }
.drill-score-badge.mid { background: #f59e0b; color: #111; }
.drill-score-badge.high { background: #22c55e; color: #fff; }
.drill-feedback-text { font-size: 0.88rem; color: var(--color-text-secondary, #6b7280); line-height: 1.5; }
.drill-model-answer { font-size: 0.85rem; color: var(--color-text, #111); line-height: 1.5; }
.drill-next-btn {
  background: #111;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.88rem;
  transition: opacity 0.15s;
  align-self: flex-end;
  margin-top: 4px;
}
.drill-next-btn:hover { opacity: 0.8; }
.drill-complete {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  padding: 8px 0;
}
.drill-complete-score {
  font-size: 2.4rem;
  font-weight: 900;
  color: var(--color-primary, #f59e0b);
}
.drill-complete-label {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text, #111);
}
.drill-restart-btn {
  background: var(--color-primary, #f59e0b);
  color: #111;
  border: none;
  border-radius: 8px;
  padding: 9px 20px;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.9rem;
  margin-top: 4px;
}

/* Vision Camera Button */
.vision-camera-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1.5px solid var(--color-border, #e5e7eb);
  background: var(--color-bg, #fff);
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  font-size: 1rem;
}
.vision-camera-btn:hover {
  border-color: var(--color-primary, #f59e0b);
  color: var(--color-primary, #f59e0b);
  background: #fffbeb;
}
.vision-camera-btn.active {
  border-color: var(--color-primary, #f59e0b);
  background: var(--color-primary, #f59e0b);
  color: #111;
}
.vision-preview-wrap {
  display: none;
  align-items: center;
  gap: 8px;
  padding: 6px 0 2px 0;
}
.vision-preview-wrap.show { display: flex; }
.vision-preview-img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
  border: 1.5px solid var(--color-primary, #f59e0b);
}
.vision-preview-name {
  font-size: 0.8rem;
  color: var(--color-text-secondary, #6b7280);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vision-clear-btn {
  font-size: 0.75rem;
  color: #ef4444;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.vision-clear-btn:hover { background: #fee2e2; }

/* Drill floating trigger button */
.drill-float-btn {
  position: fixed;
  bottom: 155px;
  right: 20px;
  background: #111;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 44px;
  height: 44px;
  font-size: 1.1rem;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 8999;
  transition: transform 0.15s, opacity 0.15s;
  title: 'Viva Drill Mode';
}
.drill-float-btn:hover { transform: scale(1.08); opacity: 0.9; }
`;

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = DRILL_STYLES;
  document.head.appendChild(styleEl);

  // ---- Build Viva Drill Panel ----
  const drillPanel = document.createElement('div');
  drillPanel.id = 'vivaDrillPanel';
  drillPanel.innerHTML = `
    <div class="drill-header">
      <span>⚡ Viva Drill Mode</span>
      <div style="display:flex;gap:6px;align-items:center;">
        <span id="drillSessionBadge" style="display:none;font-size:0.75rem;background:rgba(0,0,0,0.12);padding:2px 8px;border-radius:20px;"></span>
        <button id="closeDrillPanel" title="Close">✕</button>
      </div>
    </div>
    <div class="drill-body" id="drillBody">
      <div class="drill-setup" id="drillSetup">
        <div style="font-size:0.85rem;color:var(--color-text-secondary,#6b7280);line-height:1.5;">
          Practice viva questions interactively. The AI asks, you answer, and it grades you in real time.
        </div>
        <input type="text" id="drillTopicInput" placeholder="Enter topic or leave blank to use uploaded file..." />
        <button class="drill-start-btn" id="drillStartBtn">🚀 Start Drill (5 Questions)</button>
      </div>

      <div id="drillQuestion" style="display:none;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span class="drill-progress" id="drillProgressText">Question 1 of 5</span>
        </div>
        <div class="drill-progress-bar"><div class="drill-progress-fill" id="drillProgressFill" style="width:0%;"></div></div>
        <div class="drill-question-card" id="drillQuestionText"></div>
        <div class="drill-answer-area">
          <textarea id="drillAnswerInput" placeholder="Type your answer here... (Ctrl+Enter to submit)"></textarea>
          <button class="drill-submit-btn" id="drillSubmitBtn">Submit Answer →</button>
        </div>
      </div>

      <div id="drillFeedback" style="display:none;flex-direction:column;gap:10px;">
        <div class="drill-feedback">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span class="drill-score-badge" id="drillScoreBadge">8/10</span>
            <span style="font-size:0.8rem;font-weight:600;color:var(--color-text-secondary,#6b7280);">Score</span>
          </div>
          <p class="drill-feedback-text" id="drillFeedbackText"></p>
          <details style="margin-top:4px;">
            <summary style="font-size:0.82rem;cursor:pointer;color:var(--color-text-secondary,#6b7280);">View model answer</summary>
            <p class="drill-model-answer" id="drillModelAnswer"></p>
          </details>
        </div>
        <button class="drill-next-btn" id="drillNextBtn">Next Question →</button>
      </div>

      <div id="drillComplete" class="drill-complete" style="display:none;">
        <div class="drill-complete-score" id="drillFinalScore">7/10</div>
        <div class="drill-complete-label">Drill Complete! 🎓</div>
        <div style="font-size:0.85rem;color:var(--color-text-secondary,#6b7280);" id="drillCompleteSummary"></div>
        <button class="drill-restart-btn" id="drillRestartBtn">🔄 New Drill</button>
      </div>
    </div>
  `;
  document.body.appendChild(drillPanel);

  // Floating trigger button
  const drillFloatBtn = document.createElement('button');
  drillFloatBtn.className = 'drill-float-btn';
  drillFloatBtn.title = 'Viva Drill Mode';
  drillFloatBtn.innerHTML = '🎯';
  document.body.appendChild(drillFloatBtn);

  // Drill state
  let drillSessionId = null;
  let drillCurrentQ = 0;
  let drillTotal = 5;
  let drillNextQuestion = null;
  let drillScores = [];

  const $ = (id) => document.getElementById(id);

  function showDrillSection(section) {
    ['drillSetup', 'drillQuestion', 'drillFeedback', 'drillComplete'].forEach(id => {
      const el = $(id);
      if (el) el.style.display = 'none';
    });
    const target = $(section);
    if (target) target.style.display = 'flex';
  }

  drillFloatBtn.addEventListener('click', () => {
    drillPanel.classList.toggle('open');
  });

  $('closeDrillPanel').addEventListener('click', () => {
    drillPanel.classList.remove('open');
  });

  $('drillStartBtn').addEventListener('click', startDrill);

  async function startDrill() {
    const topicInput = $('drillTopicInput');
    const topic = topicInput ? topicInput.value.trim() : '';
    const startBtn = $('drillStartBtn');
    if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Generating questions...'; }

    // Try to use current file context
    let fileContent = '';
    let filename = '';
    try {
      if (window.lastHomeVivaDirectFilePayload) {
        fileContent = window.lastHomeVivaDirectFilePayload.codeContent || window.lastHomeVivaDirectFilePayload.content || '';
        filename = window.lastHomeVivaDirectFilePayload.name || '';
      } else if (window.lastCodePayload) {
        fileContent = window.lastCodePayload.codeContent || window.lastCodePayload.content || '';
        filename = window.lastCodePayload.name || window.lastCodePayload.filename || '';
      }
    } catch (_) {}

    try {
      const res = await fetch('/api/ai/viva-drill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          topic: topic || filename || 'Computer Science Lab',
          fileContent: fileContent.slice(0, 6000),
          filename
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to start drill.');

      drillSessionId = data.sessionId;
      drillCurrentQ = 1;
      drillTotal = data.totalQuestions || 5;
      drillScores = [];

      updateDrillProgress(drillCurrentQ, drillTotal);
      $('drillQuestionText').textContent = data.question;
      $('drillAnswerInput').value = '';
      showDrillSection('drillQuestion');

      const badge = $('drillSessionBadge');
      if (badge) { badge.style.display = 'inline-block'; badge.textContent = `${drillCurrentQ}/${drillTotal}`; }

    } catch (err) {
      alert('Could not start drill: ' + err.message);
    } finally {
      if (startBtn) { startBtn.disabled = false; startBtn.textContent = '🚀 Start Drill (5 Questions)'; }
    }
  }

  function updateDrillProgress(current, total) {
    const progressText = $('drillProgressText');
    const progressFill = $('drillProgressFill');
    const badge = $('drillSessionBadge');
    if (progressText) progressText.textContent = `Question ${current} of ${total}`;
    if (progressFill) progressFill.style.width = `${((current - 1) / total) * 100}%`;
    if (badge) badge.textContent = `${current}/${total}`;
  }

  $('drillSubmitBtn').addEventListener('click', submitDrillAnswer);

  $('drillAnswerInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      submitDrillAnswer();
    }
  });

  async function submitDrillAnswer() {
    const answer = $('drillAnswerInput').value.trim();
    if (!answer) return;
    if (!drillSessionId) return;

    const submitBtn = $('drillSubmitBtn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Grading...'; }

    try {
      const res = await fetch('/api/ai/viva-drill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'answer', sessionId: drillSessionId, answer })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Grading failed.');

      drillScores.push(data.score || 7);
      drillNextQuestion = data.nextQuestion || null;

      // Show feedback
      const scoreBadge = $('drillScoreBadge');
      if (scoreBadge) {
        scoreBadge.textContent = `${data.score}/10`;
        scoreBadge.className = 'drill-score-badge ' + (data.score >= 8 ? 'high' : data.score >= 5 ? 'mid' : 'low');
      }
      const fbText = $('drillFeedbackText');
      if (fbText) fbText.textContent = data.feedback || '';
      const modelAns = $('drillModelAnswer');
      if (modelAns) modelAns.textContent = data.modelAnswer || '';

      showDrillSection('drillFeedback');

      if (data.isComplete) {
        // Show next btn as "See Results"
        const nextBtn = $('drillNextBtn');
        if (nextBtn) { nextBtn.textContent = 'See Results 🏆'; }
      }

    } catch (err) {
      alert('Error: ' + err.message);
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Answer →'; }
    }
  }

  $('drillNextBtn').addEventListener('click', () => {
    if (!drillNextQuestion) {
      // Show complete screen
      const avg = drillScores.length ? Math.round(drillScores.reduce((a, b) => a + b, 0) / drillScores.length) : 0;
      const finalScore = $('drillFinalScore');
      if (finalScore) finalScore.textContent = `${avg}/10`;
      const summary = $('drillCompleteSummary');
      const grade = avg >= 8 ? 'Excellent!' : avg >= 6 ? 'Good job!' : 'Keep practicing!';
      if (summary) summary.textContent = `Average score: ${avg}/10 — ${grade}`;
      showDrillSection('drillComplete');
      const badge = $('drillSessionBadge');
      if (badge) badge.style.display = 'none';
    } else {
      drillCurrentQ += 1;
      updateDrillProgress(drillCurrentQ, drillTotal);
      $('drillQuestionText').textContent = drillNextQuestion;
      $('drillAnswerInput').value = '';
      $('drillNextBtn').textContent = 'Next Question →';
      showDrillSection('drillQuestion');
      $('drillAnswerInput').focus();
    }
  });

  $('drillRestartBtn').addEventListener('click', () => {
    drillSessionId = null;
    drillScores = [];
    drillNextQuestion = null;
    if ($('drillTopicInput')) $('drillTopicInput').value = '';
    showDrillSection('drillSetup');
    const badge = $('drillSessionBadge');
    if (badge) badge.style.display = 'none';
  });

  // ============================================================
  // Upgrade 3: Vision Analysis — Camera/Photo Upload in AI Chat
  // ============================================================

  function injectVisionButton(chatFormId, chatInputId, messagesId, getHistory, getFilesPayload) {
    const form = document.getElementById(chatFormId);
    if (!form) return;

    // Create hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.id = chatFormId + '_visionInput';
    form.appendChild(fileInput);

    // Camera button
    const camBtn = document.createElement('button');
    camBtn.type = 'button';
    camBtn.className = 'vision-camera-btn';
    camBtn.title = 'Snap or upload a photo for AI vision analysis';
    camBtn.innerHTML = '📷';

    // Insert before the submit button
    const submitBtn = form.querySelector('button[type="submit"]') || form.querySelector('button');
    if (submitBtn) {
      form.insertBefore(camBtn, submitBtn);
    } else {
      form.appendChild(camBtn);
    }

    // Vision preview container (inside form)
    const previewWrap = document.createElement('div');
    previewWrap.className = 'vision-preview-wrap';
    previewWrap.id = chatFormId + '_visionPreview';
    previewWrap.innerHTML = `
      <img class="vision-preview-img" id="${chatFormId}_visionImg" src="" alt="photo preview" />
      <span class="vision-preview-name" id="${chatFormId}_visionName">photo.jpg</span>
      <button type="button" class="vision-clear-btn" id="${chatFormId}_visionClear">✕</button>
    `;
    form.parentNode.insertBefore(previewWrap, form);

    let pendingImageBase64 = null;
    let pendingImageMime = null;
    let pendingImageName = null;

    camBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      fileInput.value = '';

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const base64 = dataUrl.split(',')[1];
        pendingImageBase64 = base64;
        pendingImageMime = file.type || 'image/jpeg';
        pendingImageName = file.name || 'photo.jpg';

        const prevImg = document.getElementById(chatFormId + '_visionImg');
        const prevName = document.getElementById(chatFormId + '_visionName');
        if (prevImg) prevImg.src = dataUrl;
        if (prevName) prevName.textContent = pendingImageName;
        previewWrap.classList.add('show');
        camBtn.classList.add('active');

        // Set a helpful prompt hint in the input
        const chatInput = document.getElementById(chatInputId);
        if (chatInput && !chatInput.value.trim()) {
          chatInput.value = 'Please analyze this image and explain what you see.';
        }
      };
      reader.readAsDataURL(file);
    });

    document.getElementById(chatFormId + '_visionClear').addEventListener('click', () => {
      pendingImageBase64 = null;
      pendingImageMime = null;
      pendingImageName = null;
      previewWrap.classList.remove('show');
      camBtn.classList.remove('active');
    });

    // Hook into form submit to inject image into directFiles
    form.addEventListener('submit', (e) => {
      if (!pendingImageBase64) return; // no image, normal submit
      e.preventDefault();
      e.stopImmediatePropagation();

      const chatInput = document.getElementById(chatInputId);
      const text = (chatInput ? chatInput.value.trim() : '') || 'Please analyze this image in detail.';
      if (chatInput) chatInput.value = '';

      const messages = document.getElementById(messagesId);
      if (messages) {
        messages.style.display = 'flex';
        // User bubble with image thumbnail
        const userBubble = document.createElement('div');
        userBubble.className = 'ai-chat-user-bubble';
        userBubble.innerHTML = `<img src="data:${pendingImageMime};base64,${pendingImageBase64.slice(0, 50)}..." style="display:none;" />${escapeHtml(text)} <span style="font-size:0.75rem;opacity:0.6;">📷 Photo attached</span>`;
        messages.appendChild(userBubble);

        const botBubble = document.createElement('div');
        botBubble.className = 'ai-chat-bot-bubble';
        botBubble.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Analyzing image...';
        messages.appendChild(botBubble);
        messages.scrollTop = messages.scrollHeight;

        const imgBase64 = pendingImageBase64;
        const imgMime = pendingImageMime;
        const imgName = pendingImageName;

        // Clear pending
        pendingImageBase64 = null;
        pendingImageMime = null;
        pendingImageName = null;
        previewWrap.classList.remove('show');
        camBtn.classList.remove('active');

        // Build directFiles with the image
        const baseFiles = (getFilesPayload ? getFilesPayload() : []);
        const directFiles = [...baseFiles, {
          name: imgName,
          isImage: true,
          imageBase64: imgBase64,
          mimeType: imgMime
        }];

        const history = getHistory ? getHistory() : [];

        const streamAiChat = window._labDropStreamAiChat;
        if (streamAiChat) {
          let fullText = '';
          streamAiChat({
            prompt: text,
            conversationHistory: history,
            previousOutput: '',
            directFiles
          }, {
            onChunk: (chunk) => {
              fullText += chunk;
              botBubble.textContent = fullText;
              messages.scrollTop = messages.scrollHeight;
            },
            onDone: (cleaned) => {
              const final = cleaned || fullText;
              if (window.marked) {
                botBubble.innerHTML = window.marked.parse(final);
              } else {
                botBubble.textContent = final;
              }
              messages.scrollTop = messages.scrollHeight;
            },
            onError: (err) => {
              botBubble.innerHTML = `<span style="color:#ef4444;">Vision error: ${escapeHtml(String(err))}</span>`;
              messages.scrollTop = messages.scrollHeight;
            }
          });
        }
      }
    }, true);
  }

  // Inject vision buttons into both chat forms
  document.addEventListener('DOMContentLoaded', () => {
    injectVisionButton(
      'labRecordChatForm',
      'labRecordChatInput',
      'labRecordChatMessages',
      () => window.labRecordConversationHistory || [],
      () => {
        const p = window.lastCodePayload;
        return p ? [{ name: p.filename || p.name || 'file', content: p.codeContent || p.content || '', pdfBase64: p.pdfBase64 || null, mimeType: p.mimeType || null }] : [];
      }
    );
    injectVisionButton(
      'homeVivaChatForm',
      'homeVivaChatInput',
      'homeVivaChatMessages',
      () => window.homeVivaConversationHistory || [],
      () => {
        const p = window.lastHomeVivaDirectFilePayload || window.lastCodePayload;
        return p ? [{ name: p.filename || p.name || 'file', content: p.codeContent || p.content || '', pdfBase64: p.pdfBase64 || null, mimeType: p.mimeType || null }] : [];
      }
    );
  });

  // Also try immediately (if DOM is already ready)
  if (document.readyState !== 'loading') {
    injectVisionButton(
      'labRecordChatForm',
      'labRecordChatInput',
      'labRecordChatMessages',
      () => [],
      () => []
    );
    injectVisionButton(
      'homeVivaChatForm',
      'homeVivaChatInput',
      'homeVivaChatMessages',
      () => [],
      () => []
    );
  }

})();
