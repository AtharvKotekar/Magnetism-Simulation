// Uniform spatial hash over the sheet with counting sort — deterministic
// iteration order (ascending particle index within each cell).

export class HashGrid {
  constructor(sheetW, sheetH, cell, maxN) {
    this.cell = cell;
    this.nx = Math.max(1, Math.ceil(sheetW / cell));
    this.ny = Math.max(1, Math.ceil(sheetH / cell));
    this.nCells = this.nx * this.ny;
    this.count = new Int32Array(this.nCells + 1);
    this.start = new Int32Array(this.nCells + 1);
    this.items = new Int32Array(maxN);
    this.cellOf = new Int32Array(maxN);
  }

  cellIndex(x, y) {
    let cx = (x / this.cell) | 0, cy = (y / this.cell) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.nx) cx = this.nx - 1;
    if (cy < 0) cy = 0; else if (cy >= this.ny) cy = this.ny - 1;
    return cy * this.nx + cx;
  }

  build(px, py, n) {
    const { count, start, items, cellOf } = this;
    count.fill(0);
    for (let i = 0; i < n; i++) {
      const c = this.cellIndex(px[i], py[i]);
      cellOf[i] = c;
      count[c]++;
    }
    let acc = 0;
    for (let c = 0; c < this.nCells; c++) { start[c] = acc; acc += count[c]; }
    start[this.nCells] = acc;
    // counting sort: fill items in ascending i per cell
    const cursor = this.count; // reuse as cursor
    for (let c = 0; c < this.nCells; c++) cursor[c] = start[c];
    for (let i = 0; i < n; i++) items[cursor[cellOf[i]]++] = i;
    // restore counts as (start[c+1]-start[c]) is derivable; keep cursor trashed
  }

  // Iterate neighbor candidates of particle i in the 3×3 cells around (x,y).
  // Calls fn(j) for each candidate j != i. Deterministic order.
  forNeighbors(i, x, y, fn) {
    const cx = Math.min(this.nx - 1, Math.max(0, (x / this.cell) | 0));
    const cy = Math.min(this.ny - 1, Math.max(0, (y / this.cell) | 0));
    const x0 = Math.max(0, cx - 1), x1 = Math.min(this.nx - 1, cx + 1);
    const y0 = Math.max(0, cy - 1), y1 = Math.min(this.ny - 1, cy + 1);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const c = gy * this.nx + gx;
        const s = this.start[c], e = this.start[c + 1];
        for (let k = s; k < e; k++) {
          const j = this.items[k];
          if (j !== i) fn(j);
        }
      }
    }
  }
}
