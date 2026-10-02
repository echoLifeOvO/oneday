"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { messages, type Locale } from "@/lib/i18n";
const Context = createContext({locale:"zh" as Locale,setLocale: (_locale:Locale) => {}, t:messages.zh});
export function LocaleProvider({children}:{children:React.ReactNode}) {
  const [locale,setLocale] = useState<Locale>("zh");
  const [loaded,setLoaded] = useState(false);
  useEffect(() => { try { if(localStorage.getItem("one-day-language")==="en") setLocale("en"); } catch {} setLoaded(true); },[]);
  useEffect(() => {
    document.documentElement.lang=locale==="zh"?"zh-CN":"en";
    if(loaded) try { localStorage.setItem("one-day-language",locale); } catch {}
  },[locale,loaded]);
  const value=useMemo(()=>({locale,setLocale,t:messages[locale]}),[locale]);
  return <Context.Provider value={value}><title>{messages[locale].title}</title>{children}</Context.Provider>;
}
export function useLocale() { return useContext(Context); }
export function LanguageSwitch() {
  const {locale,setLocale}=useLocale();
  return <nav className="language-switch" aria-label={locale==="zh"?"语言":"Language"}>
    <button type="button" lang="zh" aria-pressed={locale==="zh"} onClick={()=>setLocale("zh")}>中文</button><span aria-hidden="true">/</span>
    <button type="button" lang="en" aria-pressed={locale==="en"} onClick={()=>setLocale("en")}>EN</button>
  </nav>;
}
