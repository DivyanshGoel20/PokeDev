import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getUser();
  if (!me) redirect("/login");
  return (
    <>
      {children}
      <Nav />
    </>
  );
}
