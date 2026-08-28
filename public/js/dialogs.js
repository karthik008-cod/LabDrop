/**
 * LabDrop Custom Dialogs
 * Replaces native alert(), confirm(), and prompt() with theme-matching async modals.
 */

window.LabDialog = (function() {
    function createDialogDOM(title, message, type, defaultInputValue = '') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);opacity:0;transition:opacity var(--transition-fast);';
            
            const card = document.createElement('div');
            card.style.cssText = 'background:var(--color-bg);padding:24px;border-radius:var(--radius-lg);width:90%;max-width:360px;box-shadow:var(--shadow-md);border:1px solid var(--color-border);transform:translateY(20px);transition:transform var(--transition-fast);display:flex;flex-direction:column;gap:16px;';
            
            // Header (Title & Logo)
            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.gap = '8px';
            header.innerHTML = `
                <div style="width:24px;height:24px;background:var(--color-primary);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:bold;">🚀</div>
                <h3 style="margin:0;font-size:1rem;color:var(--color-text);font-weight:600;">${title}</h3>
            `;
            card.appendChild(header);

            // Message
            const msg = document.createElement('p');
            msg.innerText = message;
            msg.style.margin = '0';
            msg.style.color = 'var(--color-text-secondary)';
            msg.style.fontSize = '0.9rem';
            msg.style.lineHeight = '1.4';
            card.appendChild(msg);

            // Input (if prompt)
            let inputField = null;
            if (type === 'prompt') {
                inputField = document.createElement('input');
                inputField.type = 'text';
                inputField.value = defaultInputValue;
                inputField.className = 'form-input';
                inputField.style.width = '100%';
                inputField.style.boxSizing = 'border-box';
                card.appendChild(inputField);
            }

            // Buttons
            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.justifyContent = 'flex-end';
            btnContainer.style.gap = '8px';
            btnContainer.style.marginTop = '8px';

            const closeDialog = (result) => {
                overlay.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
                setTimeout(() => {
                    if (document.body.contains(overlay)) {
                        document.body.removeChild(overlay);
                    }
                    resolve(result);
                }, 150);
            };

            if (type === 'confirm' || type === 'prompt') {
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'btn btn--outline btn--sm';
                cancelBtn.innerText = 'Cancel';
                cancelBtn.onclick = () => closeDialog(type === 'prompt' ? null : false);
                btnContainer.appendChild(cancelBtn);
            }

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'btn btn--primary btn--sm';
            confirmBtn.innerText = 'OK';
            confirmBtn.onclick = () => {
                if (type === 'prompt') {
                    closeDialog(inputField.value);
                } else if (type === 'confirm') {
                    closeDialog(true);
                } else {
                    closeDialog(true); // alert
                }
            };
            btnContainer.appendChild(confirmBtn);

            card.appendChild(btnContainer);
            overlay.appendChild(card);
            document.body.appendChild(overlay);

            // Trigger animation
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                card.style.transform = 'translateY(0)';
                if (inputField) {
                    inputField.focus();
                    inputField.select();
                } else {
                    confirmBtn.focus();
                }
            });
            
            // Enter key support for prompt
            if (inputField) {
                inputField.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        confirmBtn.click();
                    }
                });
            }
        });
    }

    return {
        alert: async function(message, title = 'LabDrop') {
            return await createDialogDOM(title, message, 'alert');
        },
        confirm: async function(message, title = 'Confirm') {
            return await createDialogDOM(title, message, 'confirm');
        },
        prompt: async function(message, defaultValue = '', title = 'Input Required') {
            return await createDialogDOM(title, message, 'prompt', defaultValue);
        }
    };
})();
