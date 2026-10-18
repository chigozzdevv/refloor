export class MinHeap {
  private readonly entries: { index: number; priority: number }[] = [];

  push(index: number, priority: number): void {
    const item = { index, priority };
    this.entries.push(item);
    let i = this.entries.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2),
        entry = this.entries[parent];
      if (!entry || entry.priority <= priority) break;
      this.entries[i] = entry;
      i = parent;
    }
    this.entries[i] = item;
  }

  pop(): { index: number; priority: number } | undefined {
    const first = this.entries[0],
      last = this.entries.pop();
    if (!first || !last || !this.entries.length) return first;
    let i = 0;
    while (i * 2 + 1 < this.entries.length) {
      const left = i * 2 + 1,
        right = left + 1;
      let child = left;
      const a = this.entries[left],
        b = this.entries[right];
      if (a && b && b.priority < a.priority) child = right;
      const entry = this.entries[child];
      if (!entry || last.priority <= entry.priority) break;
      this.entries[i] = entry;
      i = child;
    }
    this.entries[i] = last;
    return first;
  }
}
