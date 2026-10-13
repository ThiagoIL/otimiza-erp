import { PartnersList } from "@/views/tenant/partners";

type SP = Promise<Record<string, string | undefined>>;
export default function Page({ searchParams }: { searchParams: SP }) {
  return <PartnersList searchParams={searchParams} />;
}
