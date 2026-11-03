import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import RecoverForm from "./RecoverForm";
import { FreshOnBack } from "@/components/FreshOnBack";

export const dynamic = "force-dynamic";

/** Signed in with a face already? Nothing to recover. (A face-less leftover sign-up may recover.) */
export default async function Page() {
  const me = await getUser();
  if (me?.has_face) redirect("/");
  return (
    <>
      <FreshOnBack />
      <RecoverForm />
    </>
  );
}
