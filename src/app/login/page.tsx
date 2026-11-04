import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import LoginForm from "./LoginForm";
import { FreshOnBack } from "@/components/FreshOnBack";
import { PreloadScanner } from "@/components/PreloadScanner";

export const dynamic = "force-dynamic";

/** Already signed in? Never show this form again: go straight to the app. */
export default async function Page() {
  const me = await getUser();
  if (me) redirect(me.has_face ? "/" : "/scan");
  return (
    <>
      <FreshOnBack />
      <PreloadScanner />
      <LoginForm />
    </>
  );
}
