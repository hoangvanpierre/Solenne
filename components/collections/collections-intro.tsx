import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { TextReveal } from "@/components/animations/text-reveal";
import styles from "./collections.module.css";

export interface CollectionsIntroProps {
  title: string;
  intro: string;
}

/**
 * Page header for /collections: the title rises word by word through the
 * site-wide `TextReveal` primitive, the intro paragraph follows with a short
 * fade-up, and a low amber glow breathes behind both.
 *
 * The markup is identical on the server and the client — reduced motion is
 * handled by CSS (`collections.module.css`) rather than by switching props on
 * `useReducedMotion`, which would hydrate a different tree than the one the
 * server rendered.
 */
export function CollectionsIntro({ title, intro }: CollectionsIntroProps) {
  return (
    <div className={styles.intro}>
      <div className={styles.glow} aria-hidden="true" />
      <TextReveal
        text={title}
        as="h1"
        className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] mb-3 text-foreground"
      />
      <ScrollReveal className={styles.introBody} delay={0.15}>
        <p className="text-muted-foreground text-sm sm:text-base max-w-2xl leading-relaxed">
          {intro}
        </p>
      </ScrollReveal>
    </div>
  );
}
