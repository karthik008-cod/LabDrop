document.addEventListener('DOMContentLoaded', () => {
  const items = document.querySelectorAll('.dec-item');
  if (!items.length) return;
  
  // We want to distribute them equally but at random places.
  // Using a 4x4 grid (16 cells) for up to 13 items.
  const cols = 4;
  const rows = 4;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({r, c});
    }
  }
  
  // Shuffle the cells to randomize which cell gets an item
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  
  items.forEach((item, index) => {
    if (index >= cells.length) return;
    const cell = cells[index];
    
    // Calculate cell dimensions in percentage
    const cellWidth = 100 / cols;
    const cellHeight = 100 / rows;
    
    // Random position inside the cell, with some padding to avoid overlap near edges
    const paddingX = cellWidth * 0.15;
    const paddingY = cellHeight * 0.15;
    
    const randomX = paddingX + Math.random() * (cellWidth - 2 * paddingX);
    const randomY = paddingY + Math.random() * (cellHeight - 2 * paddingY);
    
    const left = cell.c * cellWidth + randomX;
    const top = cell.r * cellHeight + randomY;
    
    // Random rotation for a scattered look
    const rot = Math.floor(Math.random() * 360);
    
    // Apply inline styles to override CSS rules
    item.style.position = 'absolute';
    item.style.left = `${left}%`;
    item.style.top = `${top}%`;
    item.style.bottom = 'auto';
    item.style.right = 'auto';
    item.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;
  });
});
