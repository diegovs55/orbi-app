import Image from "next/image";
import Link from "next/link";

export function BrandMark() {
  return (
    <Link
      href="/"
      className="inline-flex h-14 w-24 items-center overflow-hidden rounded-md"
      aria-label="Orbi inicio"
    >
      <Image
        src="/orbi-logo.png"
        alt="Orbi"
        width={96}
        height={56}
        className="h-full w-full object-contain object-left"
        priority
      />
    </Link>
  );
}
