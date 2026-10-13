import { PartnerEdit } from "@/views/tenant/partners";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <PartnerEdit params={params} />;
}
