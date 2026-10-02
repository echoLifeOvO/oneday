"use client";
import { useLayoutEffect, useRef } from "react";
import { costSchema } from "@/lib/day-input";
import { MAX_COST } from "@/lib/limits";

export default function AmountInput({ value, onChange, label }: { value: number | null; onChange: (value: number | null) => void; label: string }) {
  const input = useRef<HTMLInputElement>(null), mirror = useRef<HTMLSpanElement>(null);
  const measure = () => { if (mirror.current && input.current) mirror.current.textContent = input.current.value || "0"; };
  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    if (value === null) { if (node.value) node.value = ""; }
    else if (node.valueAsNumber !== value) node.value = String(value);
    measure();
  }, [value]);
  return <span className="amount-input"><span aria-hidden="true" ref={mirror}>{value ?? "0"}</span>
    <input ref={input} id="day-cost" aria-label={label} inputMode="decimal" type="number" min={0} max={MAX_COST} step="0.01"
      required autoComplete="off" placeholder="0" defaultValue={value ?? ""}
      onKeyDown={e => { if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }}
      onPaste={e => {
        const text = e.clipboardData.getData("text");
        if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(text) || !costSchema.safeParse(Number(text)).success) e.preventDefault();
      }}
      onChange={e => {
        const node = e.currentTarget;
        if (node.value === "" && !node.validity.badInput) { onChange(null); measure(); return; }
        const amount = node.valueAsNumber;
        if (!node.validity.badInput && costSchema.safeParse(amount).success) onChange(amount);
        else node.value = value === null ? "" : String(value);
        measure();
      }}/>
  </span>;
}
