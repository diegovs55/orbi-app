import { PageShell } from "@/components/PageShell";
import { MyAccount } from "@/components/MyAccount";

export default function UsuariosPage() {
  return (
    <PageShell
      eyebrow="Red Orbi"
      title="Mi cuenta."
      description="Tu historial de misiones y configuración personal."
    >
      <MyAccount />
    </PageShell>
  );
}
