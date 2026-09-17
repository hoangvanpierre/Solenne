"use client";

import { useState, useRef, useEffect, useId, forwardRef } from "react";
import { ChevronDown, Check, Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
}

export interface ComboboxProps {
  label?: string;
  error?: string;
  value: string;
  onChange: (value: string, option?: ComboboxOption) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
  allowCustomValue?: boolean;
  className?: string;
  id?: string;
  name?: string;
}

function removeDiacritics(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(
  (
    {
      label,
      error,
      value,
      onChange,
      options,
      placeholder = "Select...",
      searchPlaceholder = "Search...",
      emptyText = "No options found.",
      disabled = false,
      loading = false,
      required = false,
      allowCustomValue = false,
      className,
      id,
      name,
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const selectedOption = options.find((opt) => opt.value === value) || (
      value && allowCustomValue ? { value, label: value } : undefined
    );

    // Normalize and filter options
    const normalizedQuery = removeDiacritics(searchQuery.trim());
    const filteredOptions = options.filter((opt) => {
      if (!normalizedQuery) return true;
      const labelMatch = removeDiacritics(opt.label).includes(normalizedQuery);
      const sublabelMatch = opt.sublabel
        ? removeDiacritics(opt.sublabel).includes(normalizedQuery)
        : false;
      const valueMatch = opt.value.toLowerCase().includes(normalizedQuery);
      return labelMatch || sublabelMatch || valueMatch;
    });

    // Outside click listener
    useEffect(() => {
      const handleOutsideClick = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
          setSearchQuery("");
        }
      };

      if (isOpen) {
        document.addEventListener("mousedown", handleOutsideClick);
      }
      return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [isOpen]);

    // Focus search input on open
    useEffect(() => {
      if (isOpen) {
        setHighlightedIndex(0);
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 50);
      }
    }, [isOpen]);

    const handleSelect = (option: ComboboxOption) => {
      onChange(option.value, option);
      setIsOpen(false);
      setSearchQuery("");
    };

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange("");
      setSearchQuery("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled || loading) return;

      if (!isOpen) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex]);
        } else if (allowCustomValue && searchQuery.trim()) {
          const custom = searchQuery.trim();
          onChange(custom, { value: custom, label: custom });
          setIsOpen(false);
          setSearchQuery("");
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    return (
      <div ref={containerRef} className={cn("space-y-1.5 relative", className)}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-foreground flex items-center justify-between"
          >
            <span>{label}</span>
            {required && <span className="text-xs text-amber">*</span>}
          </label>
        )}

        {/* Hidden input to support standard form submissions */}
        {name && <input type="hidden" name={name} value={value} />}

        {/* Trigger Button */}
        <button
          ref={ref}
          type="button"
          id={inputId}
          disabled={disabled || loading}
          onClick={() => setIsOpen((prev) => !prev)}
          onKeyDown={handleKeyDown}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className={cn(
            "flex h-11 w-full items-center justify-between rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground",
            "transition-colors duration-200 text-left",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/30 focus-visible:border-amber",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/30",
            error && "border-destructive focus-visible:ring-destructive",
            !selectedOption && "text-muted-foreground"
          )}
        >
          <span className="truncate flex items-center gap-2">
            {selectedOption ? (
              <>
                <span className="text-foreground">{selectedOption.label}</span>
                {selectedOption.badge && (
                  <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-amber/10 text-amber border border-amber/20">
                    {selectedOption.badge}
                  </span>
                )}
              </>
            ) : (
              placeholder
            )}
          </span>

          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                {value && !disabled && (
                  <span
                    onClick={handleClear}
                    className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Clear"
                    role="button"
                  >
                    <X className="w-3.5 h-3.5" />
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform duration-200",
                    isOpen && "rotate-180 text-foreground"
                  )}
                />
              </>
            )}
          </div>
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-border/80 bg-background shadow-xl backdrop-blur-lg overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
            {/* Search Input Box */}
            <div className="p-2 border-b border-border/60 bg-muted/20 flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground ml-1 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none py-1.5"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="p-1 text-muted-foreground hover:text-foreground rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* List of Options */}
            <div
              role="listbox"
              className="max-h-60 overflow-y-auto py-1.5 divide-y divide-border/20"
            >
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option, idx) => {
                  const isSelected = option.value === value;
                  const isHighlighted = idx === highlightedIndex;

                  return (
                    <div
                      key={`${option.value}-${idx}`}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(option)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={cn(
                        "px-3.5 py-2.5 flex items-center justify-between text-sm cursor-pointer transition-colors select-none",
                        isHighlighted
                          ? "bg-amber/10 text-foreground"
                          : "text-foreground/90 hover:bg-muted/40",
                        isSelected && "font-medium text-amber bg-amber/5"
                      )}
                    >
                      <div className="flex flex-col pr-2 truncate">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{option.label}</span>
                          {option.badge && (
                            <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
                              {option.badge}
                            </span>
                          )}
                        </div>
                        {option.sublabel && (
                          <span className="text-xs text-muted-foreground truncate mt-0.5">
                            {option.sublabel}
                          </span>
                        )}
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 text-amber shrink-0 ml-2" />
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-4 text-center text-sm text-muted-foreground">
                  <p>{emptyText}</p>
                  {allowCustomValue && searchQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        const custom = searchQuery.trim();
                        onChange(custom, { value: custom, label: custom });
                        setIsOpen(false);
                        setSearchQuery("");
                      }}
                      className="mt-2.5 inline-flex items-center gap-1 text-xs text-amber hover:underline font-medium"
                    >
                      <span>Use &quot;{searchQuery.trim()}&quot;</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
    );
  }
);

Combobox.displayName = "Combobox";
