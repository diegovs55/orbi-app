import { Suspense } from "react";
import ResetPasswordClient from "./ResetPasswordClient";

export default function AgentResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-orbi-black text-orbi-text" />}>
      <ResetPasswordClient />
    </Suspense>
  );
}
