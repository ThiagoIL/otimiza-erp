"use client";
import { Icon } from "./Icon";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return <button type="button" className="btn btn-primary" onClick={() => window.print()}><Icon name="print" size={16} /> {label}</button>;
}
