import { useState, useEffect, useRef, type RefObject } from "react";

interface UseIntersectionOptions extends IntersectionObserverInit {
  triggerOnce?: boolean;
}

export function useIntersection<T extends Element = HTMLDivElement>(
  options: UseIntersectionOptions = {}
): [RefObject<T | null>, boolean] {
  const {
    threshold = 0,
    root = null,
    rootMargin = "0px",
    triggerOnce = false,
  } = options;

  const ref = useRef<T | null>(null);
  const [element, setElement] = useState<T | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    if (ref.current !== element) {
      setElement(ref.current);
    }
  });

  useEffect(() => {
    const target = element || ref.current;
    if (!target || typeof window === "undefined") return;

    let hasTriggered = false;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const intersecting = Boolean(entry?.isIntersecting);
        setIsIntersecting(intersecting);
        if (intersecting && triggerOnce && !hasTriggered) {
          hasTriggered = true;
          observer.unobserve(target);
          observer.disconnect();
        }
      },
      { threshold, root, rootMargin }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [
    element,
    Array.isArray(threshold) ? threshold.join(",") : threshold,
    root,
    rootMargin,
    triggerOnce,
  ]);

  return [ref, isIntersecting];
}
