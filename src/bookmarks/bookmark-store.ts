/**
 * Bookmark storage and management for Saor browser.
 * Supports folders, tags, and search.
 */

export type BookmarkId = string;
export type FolderId = string;

export interface Bookmark {
  id: BookmarkId;
  url: string;
  title: string;
  folderId: FolderId | null;
  tags: string[];
  createdAt: Date;
  description?: string;
}

export interface BookmarkFolder {
  id: FolderId;
  name: string;
  parentId: FolderId | null;
  createdAt: Date;
}

let _bId = 1;
let _fId = 1;
function bId(): BookmarkId { return `bm-${_bId++}`; }
function fId(): FolderId { return `folder-${_fId++}`; }

export function _resetBookmarkCounters(): void {
  _bId = 1;
  _fId = 1;
}

export class BookmarkStore {
  private bookmarks: Map<BookmarkId, Bookmark> = new Map();
  private folders: Map<FolderId, BookmarkFolder> = new Map();

  // ── Folders ────────────────────────────────────────────────────────────────

  createFolder(name: string, parentId: FolderId | null = null): BookmarkFolder {
    if (parentId !== null && !this.folders.has(parentId)) {
      throw new Error(`Parent folder ${parentId} does not exist`);
    }
    const folder: BookmarkFolder = { id: fId(), name, parentId, createdAt: new Date() };
    this.folders.set(folder.id, folder);
    return { ...folder };
  }

  renameFolder(id: FolderId, name: string): void {
    const folder = this.folders.get(id);
    if (!folder) throw new Error(`Folder ${id} does not exist`);
    folder.name = name;
  }

  deleteFolder(id: FolderId, recursive = false): void {
    if (!this.folders.has(id)) throw new Error(`Folder ${id} does not exist`);

    const childFolders = [...this.folders.values()].filter((f) => f.parentId === id);
    const childBookmarks = [...this.bookmarks.values()].filter((b) => b.folderId === id);

    if (!recursive && (childFolders.length > 0 || childBookmarks.length > 0)) {
      throw new Error(`Folder ${id} is not empty. Use recursive=true to delete it along with its contents.`);
    }

    if (recursive) {
      for (const child of childFolders) this.deleteFolder(child.id, true);
      for (const bm of childBookmarks) this.bookmarks.delete(bm.id);
    }

    this.folders.delete(id);
  }

  allFolders(): BookmarkFolder[] {
    return [...this.folders.values()].map((f) => ({ ...f }));
  }

  // ── Bookmarks ──────────────────────────────────────────────────────────────

  add(url: string, title: string, folderId: FolderId | null = null, tags: string[] = []): Bookmark {
    if (folderId !== null && !this.folders.has(folderId)) {
      throw new Error(`Folder ${folderId} does not exist`);
    }

    const bookmark: Bookmark = {
      id: bId(),
      url,
      title,
      folderId,
      tags: [...tags],
      createdAt: new Date(),
    };
    this.bookmarks.set(bookmark.id, bookmark);
    return { ...bookmark };
  }

  remove(id: BookmarkId): void {
    if (!this.bookmarks.has(id)) throw new Error(`Bookmark ${id} does not exist`);
    this.bookmarks.delete(id);
  }

  update(id: BookmarkId, updates: Partial<Pick<Bookmark, "url" | "title" | "folderId" | "tags" | "description">>): void {
    const bm = this.bookmarks.get(id);
    if (!bm) throw new Error(`Bookmark ${id} does not exist`);
    if (updates.folderId !== undefined && updates.folderId !== null && !this.folders.has(updates.folderId)) {
      throw new Error(`Folder ${updates.folderId} does not exist`);
    }
    Object.assign(bm, updates);
  }

  /** Returns true if a bookmark with the given URL already exists. */
  hasUrl(url: string): boolean {
    for (const bm of this.bookmarks.values()) {
      if (bm.url === url) return true;
    }
    return false;
  }

  /** Returns all bookmarks, optionally filtered by folder. */
  all(folderId?: FolderId | null): Bookmark[] {
    const all = [...this.bookmarks.values()].map((b) => ({ ...b }));
    if (folderId === undefined) return all;
    return all.filter((b) => b.folderId === folderId);
  }

  /** Full-text search across URL, title, description, and tags. */
  search(query: string): Bookmark[] {
    const lower = query.toLowerCase();
    return [...this.bookmarks.values()]
      .filter(
        (b) =>
          b.url.toLowerCase().includes(lower) ||
          b.title.toLowerCase().includes(lower) ||
          (b.description ?? "").toLowerCase().includes(lower) ||
          b.tags.some((t) => t.toLowerCase().includes(lower))
      )
      .map((b) => ({ ...b }));
  }

  /** Returns bookmarks that carry a specific tag. */
  byTag(tag: string): Bookmark[] {
    return [...this.bookmarks.values()]
      .filter((b) => b.tags.includes(tag))
      .map((b) => ({ ...b }));
  }

  get bookmarkCount(): number {
    return this.bookmarks.size;
  }
}
