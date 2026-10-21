import { z } from 'zod';
import { sharedEditSchema } from '@refloor/scene/collaboration';
import type { SharedEdit } from '@refloor/scene/collaboration';

const entrySchema = z.strictObject({
  sequence: z.number().int().nonnegative(),
  edit: sharedEditSchema,
});

export class SharedOutbox {
  private sequence = 0;
  private readonly prefix: string;
  private readonly legacyKey: string;
  constructor(
    projectId: string,
    memberId: string,
    private readonly storage: Storage = localStorage,
  ) {
    this.prefix = `refloor.outbox.v2.${projectId}.${memberId}.`;
    this.legacyKey = `refloor.outbox.${projectId}.${memberId}`;
  }
  load(): SharedEdit[] {
    const legacy = this.storage.getItem(this.legacyKey);
    if (legacy) {
      for (const edit of z.array(sharedEditSchema).max(100).parse(JSON.parse(legacy)))
        this.add(edit);
      this.storage.removeItem(this.legacyKey);
    }
    const keys = Array.from({ length: this.storage.length }, (_, index) => this.storage.key(index));
    const entries = keys.flatMap((key) => {
      if (!key?.startsWith(this.prefix)) return [];
      const raw = this.storage.getItem(key);
      if (!raw) return [];
      const entry = entrySchema.parse(JSON.parse(raw));
      if (key !== this.prefix + entry.edit.id)
        throw new Error('A pending change has an invalid identity.');
      return [entry];
    });
    entries.sort((a, b) => a.sequence - b.sequence || a.edit.id.localeCompare(b.edit.id));
    this.sequence = Math.max(this.sequence, ...entries.map((entry) => entry.sequence));
    return entries.map((entry) => entry.edit);
  }
  add(edit: SharedEdit) {
    const key = this.prefix + edit.id;
    const previous = this.storage.getItem(key);
    if (previous) {
      if (JSON.stringify(entrySchema.parse(JSON.parse(previous)).edit) !== JSON.stringify(edit))
        throw new Error('This pending change ID already belongs to another request.');
      return;
    }
    const sequence = Math.max(Date.now(), this.sequence + 1);
    this.storage.setItem(key, JSON.stringify({ sequence, edit }));
    this.sequence = sequence;
  }
  remove(ids: string[]) {
    for (const id of ids) this.storage.removeItem(this.prefix + id);
  }
}
