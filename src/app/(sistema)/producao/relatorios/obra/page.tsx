import { ProdReport } from "@/views/tenant/prod-reports";
export default function Page(p: { searchParams: Promise<Record<string, string | undefined>> }) { return <ProdReport by="obra" searchParams={p.searchParams} />; }
