import Link from "next/link";
import { Container } from "@/components/ui/container";
import { FOOTER_LINKS, SOCIAL_LINKS } from "@/lib/constants";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-warm-black text-cream">
      {/* Main footer */}
      <Container className="py-16 lg:py-20">
        {/* Brand section */}
        <div className="mb-12 lg:mb-16">
          <h2 className="font-serif text-4xl lg:text-5xl font-bold mb-3">
            Solenne
          </h2>
          <p className="text-cream/60 max-w-md text-sm leading-relaxed">
            Artisan scented candles crafted with intention. Hand-poured with
            natural soy wax and premium fragrance oils.
          </p>
        </div>

        {/* Links grid */}
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4 lg:gap-12">
          {Object.values(FOOTER_LINKS).map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wider mb-4 text-cream/80">
                {section.title}
              </h3>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-cream/50 hover:text-cream transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Connect section */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4 text-cream/80">
              Connect
            </h3>
            <ul className="space-y-3">
              {SOCIAL_LINKS.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-cream/50 hover:text-cream transition-colors duration-200"
                  >
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>

      {/* Bottom bar */}
      <div className="border-t border-cream/10">
        <Container className="flex flex-col items-center justify-between gap-4 py-6 sm:flex-row">
          <p className="text-xs text-cream/40">
            © {currentYear} Solenne. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link
              href="/privacy"
              className="text-xs text-cream/40 hover:text-cream/70 transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-xs text-cream/40 hover:text-cream/70 transition-colors"
            >
              Terms of Service
            </Link>
          </div>
        </Container>
      </div>
    </footer>
  );
}
