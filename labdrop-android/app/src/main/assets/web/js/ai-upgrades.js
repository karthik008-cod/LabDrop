// ============================================================
// LabDrop AI Upgrades — Viva Drill Mode & Vision Analysis
// ============================================================

(function () {
  'use strict';

  // ============================================================
  // Upgrade 2: Interactive Viva Drill Controller (In-Modal Tab)
  // ============================================================

  let drillSessionId = null;
  let drillCurrentQ = 0;
  let drillTotal = 5;
  let drillNextQuestion = null;
  let drillScores = [];

  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showDrillSection(section) {
    const sections = ['drillSetupView', 'drillQuestionView', 'drillFeedbackView', 'drillCompleteView'];
    sections.forEach(id => {
      const el = $(id);
      if (el) el.style.display = 'none';
    });
    const target = $(section);
    if (target) target.style.display = 'flex';
  }

  function syncDrillTopic() {
    const topicInput = $('drillTopicInput');
    if (!topicInput || topicInput.value.trim()) return;

    let suggestedTopic = '';
    try {
      if (window.lastHomeVivaDirectFilePayload && window.lastHomeVivaDirectFilePayload.name) {
        suggestedTopic = window.lastHomeVivaDirectFilePayload.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      } else if (window.lastCodePayload && (window.lastCodePayload.name || window.lastCodePayload.filename)) {
        const n = window.lastCodePayload.name || window.lastCodePayload.filename;
        suggestedTopic = n.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      }
    } catch (_) {}

    if (suggestedTopic) {
      topicInput.placeholder = `e.g. ${suggestedTopic} (or type custom topic)`;
    }
  }
  window._syncDrillTopic = syncDrillTopic;

  function updateDrillProgress(current, total) {
    const progressText = $('drillProgressText');
    const progressFill = $('drillProgressFill');
    const badge = $('drillSessionBadge');
    if (progressText) progressText.textContent = `Question ${current} of ${total}`;
    if (progressFill) progressFill.style.width = `${((current - 1) / total) * 100}%`;
    if (badge) badge.textContent = `Round ${current}/${total}`;
  }

  async function startDrill() {
    const topicInput = $('drillTopicInput');
    let topic = topicInput ? topicInput.value.trim() : '';
    const startBtn = $('drillStartBtn');

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

    if (!topic && filename) {
      topic = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    }

    if (startBtn) {
      startBtn.disabled = true;
      startBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></span> Generating Questions...';
    }

    try {
      const res = await fetch('/api/ai/viva-drill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          topic: topic || 'Computer Science Practical Lab',
          fileContent: fileContent.slice(0, 6000),
          filename
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to start viva drill.');

      drillSessionId = data.sessionId;
      drillCurrentQ = 1;
      drillTotal = data.totalQuestions || 5;
      drillScores = [];

      updateDrillProgress(drillCurrentQ, drillTotal);
      if ($('drillQuestionText')) $('drillQuestionText').textContent = data.question;
      if ($('drillAnswerInput')) {
        $('drillAnswerInput').value = '';
        setTimeout(() => $('drillAnswerInput').focus(), 100);
      }
      showDrillSection('drillQuestionView');

    } catch (err) {
      if (window.LabDialog) {
        window.LabDialog.alert('Could not start drill: ' + err.message);
      } else {
        alert('Could not start drill: ' + err.message);
      }
    } finally {
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = '🚀 Start 5-Question Viva Drill';
      }
    }
  }

  async function submitDrillAnswer() {
    const answerInput = $('drillAnswerInput');
    const answer = answerInput ? answerInput.value.trim() : '';
    if (!answer) {
      if (answerInput) answerInput.focus();
      return;
    }
    if (!drillSessionId) return;

    const submitBtn = $('drillSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Grading...';
    }

    try {
      const res = await fetch('/api/ai/viva-drill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'answer',
          sessionId: drillSessionId,
          answer
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Grading failed.');

      const score = Math.max(1, Math.min(10, parseInt(data.score) || 7));
      drillScores.push(score);
      drillNextQuestion = data.nextQuestion || null;

      const scoreBadge = $('drillScoreBadge');
      if (scoreBadge) {
        scoreBadge.textContent = `${score}/10`;
        scoreBadge.style.background = score >= 8 ? '#22c55e' : score >= 5 ? '#f59e0b' : '#ef4444';
      }

      if ($('drillFeedbackText')) $('drillFeedbackText').textContent = data.feedback || 'Good attempt.';
      if ($('drillModelAnswer')) $('drillModelAnswer').textContent = data.modelAnswer || 'Refer to lab record theory.';

      showDrillSection('drillFeedbackView');

      const nextBtn = $('drillNextBtn');
      if (nextBtn) {
        nextBtn.textContent = data.isComplete ? 'View Final Results 🏆' : 'Next Question →';
      }

    } catch (err) {
      if (window.LabDialog) {
        window.LabDialog.alert('Error: ' + err.message);
      } else {
        alert('Error: ' + err.message);
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Answer →';
      }
    }
  }

  function nextDrillQuestion() {
    if (!drillNextQuestion) {
      // Completed drill
      const avg = drillScores.length ? (drillScores.reduce((a, b) => a + b, 0) / drillScores.length).toFixed(1) : '7.0';
      const numAvg = parseFloat(avg);

      if ($('drillFinalScore')) $('drillFinalScore').textContent = `${avg}/10`;
      
      let summaryText = '';
      if (numAvg >= 8.5) {
        summaryText = 'Outstanding Performance! You are fully prepared to ace your university viva voce examination.';
      } else if (numAvg >= 7.0) {
        summaryText = 'Solid Knowledge! A quick review of algorithm edge cases and precautions will make it a 10/10.';
      } else {
        summaryText = 'Good Practice Run! Review the model answers and experiment aims before your oral exam.';
      }

      if ($('drillCompleteSummary')) $('drillCompleteSummary').textContent = summaryText;
      showDrillSection('drillCompleteView');

    } else {
      drillCurrentQ += 1;
      updateDrillProgress(drillCurrentQ, drillTotal);
      if ($('drillQuestionText')) $('drillQuestionText').textContent = drillNextQuestion;
      if ($('drillAnswerInput')) {
        $('drillAnswerInput').value = '';
        setTimeout(() => $('drillAnswerInput').focus(), 100);
      }
      showDrillSection('drillQuestionView');
    }
  }

  function restartDrill() {
    drillSessionId = null;
    drillScores = [];
    drillNextQuestion = null;
    drillCurrentQ = 0;
    syncDrillTopic();
    showDrillSection('drillSetupView');
  }

  function initDrillEvents() {
    const startBtn = $('drillStartBtn');
    if (startBtn) startBtn.addEventListener('click', startDrill);

    const submitBtn = $('drillSubmitBtn');
    if (submitBtn) submitBtn.addEventListener('click', submitDrillAnswer);

    const nextBtn = $('drillNextBtn');
    if (nextBtn) nextBtn.addEventListener('click', nextDrillQuestion);

    const restartBtn = $('drillRestartBtn');
    if (restartBtn) restartBtn.addEventListener('click', restartDrill);

    const answerInput = $('drillAnswerInput');
    if (answerInput) {
      answerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          submitDrillAnswer();
        }
      });
    }

    const topicInput = $('drillTopicInput');
    if (topicInput) {
      topicInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          startDrill();
        }
      });
    }
  }

  // ============================================================
  // Upgrade 3: Vision Analysis — Camera & File Upload in AI Chat
  // ============================================================

  function injectVisionButton(chatFormId, chatInputId, messagesId, getHistory, getFilesPayload) {
    const form = document.getElementById(chatFormId);
    if (!form) return;
    if (form.querySelector('.vision-camera-btn')) return; // already injected

    // Hidden file input supporting camera capture on mobile
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.id = chatFormId + '_visionInput';
    form.appendChild(fileInput);

    // Sleek Camera Button with SVG icon
    const camBtn = document.createElement('button');
    camBtn.type = 'button';
    camBtn.className = 'vision-camera-btn';
    camBtn.title = 'Snap or attach a photo / waveform / diagram';
    camBtn.setAttribute('aria-label', 'Attach photo for vision analysis');
    camBtn.style.cssText = 'height: 38px; width: 38px; border-radius: 8px; border: 1.5px solid var(--color-border, #e5e7eb); background: var(--color-bg, #fff); color: var(--color-text-secondary, #6b7280); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: all 0.15s ease; padding: 0; box-sizing: border-box;';
    camBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
        <circle cx="12" cy="13" r="4"></circle>
      </svg>
    `;

    // Insert before the submit button
    const submitBtn = form.querySelector('button[type="submit"]') || form.querySelector('button');
    if (submitBtn) {
      form.insertBefore(camBtn, submitBtn);
    } else {
      form.appendChild(camBtn);
    }

    // Preview Strip
    const previewWrap = document.createElement('div');
    previewWrap.className = 'vision-preview-wrap';
    previewWrap.id = chatFormId + '_visionPreview';
    previewWrap.style.cssText = 'display: none; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(245, 158, 11, 0.08); border-radius: 8px; border: 1px solid rgba(245, 158, 11, 0.25); margin-bottom: 6px;';
    previewWrap.innerHTML = `
      <img class="vision-preview-img" id="${chatFormId}_visionImg" src="" alt="preview" style="width: 36px; height: 36px; object-fit: cover; border-radius: 6px; border: 1.5px solid #f59e0b;" />
      <div style="flex: 1; min-width: 0;">
        <div id="${chatFormId}_visionName" style="font-size: 0.78rem; font-weight: 700; color: var(--color-text, #111); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">photo.jpg</div>
        <div style="font-size: 0.72rem; color: #b45309;">Ready for AI Vision Analysis</div>
      </div>
      <button type="button" class="vision-clear-btn" id="${chatFormId}_visionClear" style="background: none; border: none; font-size: 1rem; color: #ef4444; cursor: pointer; padding: 4px 6px;">✕</button>
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

      if (file.size > 20 * 1024 * 1024) {
        if (window.LabDialog) {
          window.LabDialog.alert('Image is too large. Please select a photo under 20 MB.');
        } else {
          alert('Image is too large. Please select a photo under 20 MB.');
        }
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        pendingImageBase64 = dataUrl.split(',')[1];
        pendingImageMime = file.type || 'image/jpeg';
        pendingImageName = file.name || 'photo.jpg';

        const prevImg = document.getElementById(chatFormId + '_visionImg');
        const prevName = document.getElementById(chatFormId + '_visionName');
        if (prevImg) prevImg.src = dataUrl;
        if (prevName) prevName.textContent = pendingImageName;
        previewWrap.style.display = 'flex';
        camBtn.style.background = '#fef3c7';
        camBtn.style.borderColor = '#f59e0b';
        camBtn.style.color = '#b45309';

        const chatInput = document.getElementById(chatInputId);
        if (chatInput && !chatInput.value.trim()) {
          chatInput.value = 'Please transcribe and analyze this diagram / handwritten note in detail.';
        }
      };
      reader.readAsDataURL(file);
    });

    document.getElementById(chatFormId + '_visionClear').addEventListener('click', () => {
      pendingImageBase64 = null;
      pendingImageMime = null;
      pendingImageName = null;
      previewWrap.style.display = 'none';
      camBtn.style.background = 'var(--color-bg, #fff)';
      camBtn.style.borderColor = 'var(--color-border, #e5e7eb)';
      camBtn.style.color = 'var(--color-text-secondary, #6b7280)';
    });

    // Intercept form submit to send vision image
    form.addEventListener('submit', (e) => {
      if (!pendingImageBase64) return; // normal submit
      e.preventDefault();
      e.stopImmediatePropagation();

      const chatInput = document.getElementById(chatInputId);
      const text = (chatInput ? chatInput.value.trim() : '') || 'Please analyze this photo in detail.';
      if (chatInput) chatInput.value = '';

      const messages = document.getElementById(messagesId);
      if (messages) {
        messages.style.display = 'flex';

        // User Bubble with photo indicator
        const userBubble = document.createElement('div');
        userBubble.className = 'ai-chat-user-bubble';
        userBubble.innerHTML = `<span>${escapeHtml(text)}</span><div style="font-size: 0.72rem; opacity: 0.85; margin-top: 4px; display: flex; align-items: center; gap: 4px;">📷 <em>Photo attached: ${escapeHtml(pendingImageName)}</em></div>`;
        messages.appendChild(userBubble);

        // Bot Thinking Bubble
        const botBubble = document.createElement('div');
        botBubble.className = 'ai-chat-bot-bubble';
        botBubble.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Inspecting image with Vision AI...';
        messages.appendChild(botBubble);
        messages.scrollTop = messages.scrollHeight;

        const imgBase64 = pendingImageBase64;
        const imgMime = pendingImageMime;
        const imgName = pendingImageName;

        // Reset state
        pendingImageBase64 = null;
        pendingImageMime = null;
        pendingImageName = null;
        previewWrap.style.display = 'none';
        camBtn.style.background = 'var(--color-bg, #fff)';
        camBtn.style.borderColor = 'var(--color-border, #e5e7eb)';
        camBtn.style.color = 'var(--color-text-secondary, #6b7280)';

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
          let streamStarted = false;

          streamAiChat({
            prompt: text,
            conversationHistory: history,
            previousOutput: '',
            directFiles
          }, {
            onChunk: (chunk) => {
              fullText += chunk;
              if (!streamStarted) {
                botBubble.innerHTML = '';
                streamStarted = true;
              }
              botBubble.textContent = fullText;
              messages.scrollTop = messages.scrollHeight;
            },
            onDone: (cleaned) => {
              const final = cleaned || fullText;
              history.push({ role: 'user', content: text });
              history.push({ role: 'model', content: final });
              if (window.marked) {
                botBubble.innerHTML = window.marked.parse(final);
              } else {
                botBubble.textContent = final;
              }
              messages.scrollTop = messages.scrollHeight;
            },
            onError: (err) => {
              botBubble.innerHTML = `<span style="color:#ef4444;">Vision AI error: ${escapeHtml(String(err))}</span>`;
              messages.scrollTop = messages.scrollHeight;
            }
          });
        }
      }
    }, true);
  }

  function initVisionButtons() {
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
  }

  // Initialize all features once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initDrillEvents();
      initVisionButtons();
    });
  } else {
    initDrillEvents();
    initVisionButtons();
  }

})();
