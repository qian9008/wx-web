/**
 * 通用数据结构与算法工具
 */

/**
 * 有界去重集合，避免无限增长导致的内存泄漏
 */
export class BoundedSet {
  private set = new Set<string>();
  private queue: string[] = []; // 保序队列，用于淘汰最旧 ID
  private maxSize: number;

  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
  }

  has(id: string): boolean {
    return this.set.has(id);
  }

  add(id: string): void {
    if (this.set.has(id)) return;
    this.set.add(id);
    this.queue.push(id);
    if (this.queue.length > this.maxSize) {
      const oldest = this.queue.shift()!;
      this.set.delete(oldest);
    }
  }

  clear(): void {
    this.set.clear();
    this.queue = [];
  }

  get size(): number {
    return this.set.size;
  }
}

/**
 * 二分插入，确保数组按时间（time 字段）有序，时间复杂度 O(log n)
 * @param arr 目标有序数组
 * @param item 待插入项
 * @returns 插入后的新数组
 */
export function binaryInsert<T extends { time: number }>(arr: T[], item: T): T[] {
  if (arr.length === 0) return [item];

  // 如果已有序且新项最新（常见场景），直接 push，O(1)
  if (item.time >= arr[arr.length - 1].time) {
    return [...arr, item];
  }

  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].time <= item.time) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const result = [...arr];
  result.splice(lo, 0, item);
  return result;
}
