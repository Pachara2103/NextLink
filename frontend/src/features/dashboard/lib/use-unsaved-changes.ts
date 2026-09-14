"use client";
import { useEffect } from "react";

/** Protect both full-document exits and links handled by the client router. */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download") || event.defaultPrevented) return;
      if (new URL(link.href).pathname === location.pathname && new URL(link.href).search === location.search) return;
      if (!window.confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?")) { event.preventDefault(); event.stopPropagation(); }
    };
    // Browser back/forward within an SPA does not emit beforeunload. The
    // Navigation API lets supported browsers cancel it before React unmounts.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const navigate = (event: Event) => {
      const action = event as Event & { navigationType?: string; destination?: { url: string } };
      if (action.navigationType !== "traverse" || !event.cancelable || !action.destination) return;
      const next = new URL(action.destination.url);
      if (next.pathname === location.pathname && next.search === location.search) return;
      if (!window.confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?")) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    navigation?.addEventListener("navigate", navigate);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); navigation?.removeEventListener("navigate", navigate); };
  }, [dirty]);
}
