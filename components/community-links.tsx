"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Github, Mail, MessageCircle, X } from "lucide-react";
import { useLocale } from "./locale-provider";
export default function CommunityLinks({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useLocale();
  return <aside className="community-links" aria-label={t.contactCreator}>
    <div className="community-inline"><nav aria-label={t.contactCreator}>
      <a href="https://x.com/echolifeovo" target="_blank" rel="noreferrer" aria-label={t.creatorX}>X</a>
      <a href="mailto:echoLifeOvO@gmail.com">{t.email}</a>
      <a href="https://github.com/echoLifeOvO/oneday" target="_blank" rel="noreferrer">GitHub ↗</a>
    </nav>
    <p><a href="https://github.com/echoLifeOvO/oneday/issues/new/choose" target="_blank" rel="noreferrer">{t.shareIdea}</a>{t.pullRequestsWelcome}</p>
    <p>{t.maintainerNote}</p></div>
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger className="contact-trigger" aria-label={t.contactCreator}><MessageCircle size={21} strokeWidth={1.5}/></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="contact-overlay"/>
        <Dialog.Content className="contact-card">
          <Dialog.Title>{t.contactCreator}</Dialog.Title>
          <Dialog.Close className="icon-button contact-close" aria-label={t.backHome}><X size={19}/></Dialog.Close>
          <nav aria-label={t.contactCreator}>
            <a href="https://x.com/echolifeovo" target="_blank" rel="noreferrer"><span className="contact-x">𝕏</span><span>@echolifeovo</span><ArrowUpRight size={15}/></a>
            <a href="mailto:echoLifeOvO@gmail.com"><Mail size={19}/><span>echoLifeOvO@gmail.com</span><ArrowUpRight size={15}/></a>
            <a href="https://github.com/echoLifeOvO/oneday" target="_blank" rel="noreferrer"><Github size={19}/><span>GitHub · One Day</span><ArrowUpRight size={15}/></a>
          </nav>
          <Dialog.Description><a href="https://github.com/echoLifeOvO/oneday/issues/new/choose" target="_blank" rel="noreferrer">{t.shareIdea}</a>{t.pullRequestsWelcome}<br/>{t.maintainerNote}</Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </aside>;
}
