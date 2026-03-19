import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export type DropdownOption = { value: string; label: string };

type DropdownProps = {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  variant?: "default" | "ghost" | "compact";
  className?: string;
  triggerClassName?: string;
  /** If true, value resets to empty after selection (for action-style dropdowns like "Add preset…") */
  resetAfterSelect?: boolean;
};

export function Dropdown({
  value,
  onChange,
  options,
  placeholder,
  label,
  disabled = false,
  variant = "default",
  className,
  triggerClassName,
  resetAfterSelect = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [triggerWidth, setTriggerWidth] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      setTriggerWidth(triggerRef.current.offsetWidth);
    } else {
      setTriggerWidth(null);
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const displayLabel =
    value && options.find((o) => o.value === value)
      ? options.find((o) => o.value === value)!.label
      : placeholder ?? "Select…";

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const triggerStyles = {
    default:
      "bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-inset focus:ring-slate-400 shadow-sm",
    ghost:
      "bg-transparent border-none px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors",
    compact:
      "bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-inset focus:ring-slate-400 cursor-pointer shadow-sm",
  };

  return (
    <div className={cn("relative w-fit", className)} ref={ref}>
      {label && (
        <label className="block text-sm font-medium text-slate-600 mb-1">
          {label}
        </label>
      )}
      <motion.button
        ref={triggerRef}
        type="button"
        whileHover={disabled ? undefined : { scale: 1.01 }}
        whileTap={disabled ? undefined : { scale: 0.99 }}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          "flex items-center justify-between gap-2 w-full text-left transition-colors cursor-pointer",
          triggerStyles[variant],
          variant === "compact" && "min-w-[120px] relative pr-8",
          disabled && "opacity-50 cursor-not-allowed",
          triggerClassName,
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label ?? "Select option"}
      >
        <span
          className={cn(
            "truncate",
            !value && placeholder && "text-slate-500",
          )}
        >
          {displayLabel}
        </span>
        <ChevronDown
          className={cn(
            "shrink-0 text-slate-400 transition-transform",
            variant === "compact" ? "w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2" : "",
            open && "rotate-180",
          )}
        />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            style={{
              transformOrigin: "top left",
              ...(triggerWidth != null && { width: triggerWidth, minWidth: triggerWidth }),
            }}
            className="absolute left-0 top-full mt-1.5 z-100 overflow-x-hidden overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 max-h-64"
            role="listbox"
          >
            {placeholder && !resetAfterSelect && (
              <motion.button
                type="button"
                whileHover={{ backgroundColor: "rgb(248 250 252)" }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelect("")}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer",
                  !value ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-600",
                )}
                role="option"
                aria-selected={!value}
              >
                {placeholder}
              </motion.button>
            )}
            {options.map((opt) => (
              <motion.button
                key={opt.value}
                type="button"
                whileHover={{ backgroundColor: "rgb(248 250 252)" }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer",
                  value === opt.value
                    ? "bg-slate-100 text-slate-900 font-medium"
                    : "text-slate-600",
                )}
                role="option"
                aria-selected={value === opt.value}
              >
                {opt.label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
