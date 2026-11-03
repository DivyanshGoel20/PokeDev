import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import FaceScan from "./FaceScan";

export const dynamic = "force-dynamic";

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const me = await getUser();
  if (!me) redirect("/login");
  const sp = await searchParams;
  return <FaceScan isNew={sp.new === "1"} hasFace={me.has_face} name={me.display_name} />;
}
