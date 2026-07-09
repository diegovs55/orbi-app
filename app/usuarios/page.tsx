import { PageShell } from "@/components/PageShell";
import { MyAccount } from "@/components/MyAccount";

export default function UsuariosPage() {
  return (
    <PageShell
      eyebrow="Red Orbi"
      title="Mi cuenta."
      description=""
    >
      <MyAccount />
    </PageShell>
  );
}
