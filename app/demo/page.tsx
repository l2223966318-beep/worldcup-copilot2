"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RetiredDemoPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/"); }, [router]);

  return (
    <>
      <noscript><meta httpEquiv="refresh" content="0;url=/" /></noscript>
      <Link href="/">进入赛事工作台</Link>
    </>
  );
}
