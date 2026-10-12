import { TitlesPage } from "@/views/tenant/finance";
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) { return <TitlesPage kind="RECEBER" searchParams={searchParams} />; }
