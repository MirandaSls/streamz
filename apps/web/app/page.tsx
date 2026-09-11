"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/stores/auth";

export default function Home() {
  const router = useRouter();
  const { user, loadFromStorage } = useAuth();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    router.replace(user ? "/app" : "/login");
  }, [user, router]);

  return (
    <main className="flex h-screen items-center justify-center text-text-muted">
      Carregando…
    </main>
  );
}
