import { ModuleFrame } from "@/components/ModuleFrame";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ModuleFrame module="comercial">{children}</ModuleFrame>;
}
