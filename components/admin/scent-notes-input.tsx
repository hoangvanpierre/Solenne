"use client";

import { useState } from "react";
import { Check, Plus, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ScentNotesInputProps {
  label: string;
  notes: string[];
  onChange: (notes: string[]) => void;
  description?: string;
  placeholder?: string;
  locale?: string;
  noteColor?: "blush" | "amber" | "sage";
  error?: string;
}

const COLOR_MAP = {
  blush: {
    chip: "border-blush/40 bg-blush/10 text-blush",
    button: "hover:bg-blush/20 text-blush",
    focus: "focus-visible:ring-blush",
  },
  amber: {
    chip: "border-amber/40 bg-amber/10 text-amber",
    button: "hover:bg-amber/20 text-amber",
    focus: "focus-visible:ring-amber",
  },
  sage: {
    chip: "border-sage/40 bg-sage/10 text-sage",
    button: "hover:bg-sage/20 text-sage",
    focus: "focus-visible:ring-sage",
  },
};

export function ScentNotesInput({
  label,
  notes,
  onChange,
  description,
  placeholder,
  locale = "en",
  noteColor = "amber",
  error,
}: ScentNotesInputProps) {
  const isVi = locale === "vi";
  const [inputValue, setInputValue] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const styles = COLOR_MAP[noteColor] ?? COLOR_MAP.amber;

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    if (!notes.includes(trimmed)) {
      onChange([...notes, trimmed]);
    }
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = (indexToRemove: number) => {
    onChange(notes.filter((_, idx) => idx !== indexToRemove));
    if (editingIndex === indexToRemove) {
      setEditingIndex(null);
    }
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(notes[index] ?? "");
  };

  const saveEdit = (index: number) => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      handleRemove(index);
    } else {
      const updated = [...notes];
      updated[index] = trimmed;
      onChange(updated);
    }
    setEditingIndex(null);
  };

  const handleEditKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit(index);
    } else if (e.key === "Escape") {
      setEditingIndex(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{label}</span>
          <span className="text-xs text-muted-foreground font-normal">
            ({notes.length})
          </span>
        </label>
        {description && (
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {description}
          </span>
        )}
      </div>

      {/* Chips Container */}
      <div className="flex flex-wrap gap-2 min-h-9 items-center p-2 rounded-lg border border-border bg-card/30">
        {notes.length === 0 && (
          <span className="text-xs text-muted-foreground italic px-1">
            {isVi ? "Chưa có nốt hương nào" : "No scent notes added yet"}
          </span>
        )}

        {notes.map((note, index) => {
          const isEditing = editingIndex === index;

          if (isEditing) {
            return (
              <div
                key={`edit-${index}`}
                className="inline-flex items-center gap-1 rounded-md border border-amber/50 bg-background px-2 py-0.5"
              >
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => handleEditKeyDown(e, index)}
                  onBlur={() => saveEdit(index)}
                  autoFocus
                  className="w-24 text-xs bg-transparent outline-none text-foreground font-medium"
                  aria-label={isVi ? "Chỉnh sửa nốt hương" : "Edit scent note"}
                />
                <button
                  type="button"
                  onClick={() => saveEdit(index)}
                  className="rounded p-0.5 text-sage hover:bg-sage/10 transition-colors"
                  aria-label={isVi ? "Lưu nốt hương" : "Save note"}
                >
                  <Check className="h-3 w-3" />
                </button>
              </div>
            );
          }

          return (
            <span
              key={`${note}-${index}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide transition-colors",
                styles.chip
              )}
            >
              <button
                type="button"
                onClick={() => startEdit(index)}
                title={
                  isVi
                    ? "Nhấn để chỉnh sửa nốt hương"
                    : "Click to edit note"
                }
                className="hover:underline underline-offset-2 cursor-pointer"
              >
                {note}
              </button>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className={cn(
                  "rounded-full p-0.5 transition-colors",
                  styles.button
                )}
                aria-label={
                  isVi
                    ? `Xóa nốt hương ${note}`
                    : `Remove scent note ${note}`
                }
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>

      {/* Input + Add button */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            placeholder ??
            (isVi
              ? "Nhập nốt hương và nhấn Enter..."
              : "Type a note and press Enter...")
          }
          className="flex h-9 w-full rounded-lg border border-border bg-transparent px-3 py-1 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-transparent transition-colors"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!inputValue.trim()}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/30 px-3 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{isVi ? "Thêm" : "Add"}</span>
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
