
document.addEventListener('DOMContentLoaded', () => {
  const openManualBtns = document.querySelectorAll('.open-manual-btn');
  const manualModal = document.getElementById('manualModal');
  const manualModalClose = document.getElementById('manualModalClose');

  if (!manualModal) return;

  function openManual(e) {
    if (e) e.preventDefault();
    manualModal.classList.add('active');
  }

  function closeManual() {
    manualModal.classList.remove('active');
  }

  openManualBtns.forEach(btn => btn.addEventListener('click', openManual));
  
  if (manualModalClose) {
    manualModalClose.addEventListener('click', closeManual);
  }

  manualModal.addEventListener('click', (e) => {
    if (e.target === manualModal) closeManual();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && manualModal.classList.contains('active')) {
      closeManual();
    }
  });
});
