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
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof window === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
        if (entry.isIntersecting && triggerOnce) {
          observer.unobserve(element);
        }
      },
      { threshold, root, rootMargin }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, root, rootMargin, triggerOnce]);

  return [ref, isIntersecting];
}
