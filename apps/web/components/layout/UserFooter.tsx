"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/stores/auth";

/** Rodapé das colunas laterais: quem sou eu e como sair. */
export default function UserFooter() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  return (
    <div className="flex items-center justify-between gap-2 border-t border-black/20 px-3 py-2 text-sm">
      <span className="truncate" title={user?.username}>
        {user?.username}
      </span>
      <button
        type="button"
        onClick={() => {
          logout();
          router.replace("/login");
        }}
        className="shrink-0 text-neutral-400 transition hover:text-white"
      >
        sair
      </button>
    </div>
  );
}
