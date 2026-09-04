"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TextRevealProps {
  text: string;
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
  className?: string;
  delay?: number;
  splitBy?: "word" | "character" | "line";
  once?: boolean;
}

export function TextReveal({
  text,
  as: Tag = "p",
  className,
  delay = 0,
  splitBy = "word",
  once = true,
}: TextRevealProps) {
  const units =
    splitBy === "character"
      ? text.split("")
      : splitBy === "line"
        ? text.split("\n")
        : text.split(" ");

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: splitBy === "character" ? 0.03 : 0.08,
        delayChildren: delay,
      },
    },
  };

  const unitVariants = {
    hidden: {
      opacity: 0,
      y: 20,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.4, 0.25, 1],
      },
    },
  };

  return (
    <Tag className={cn(className)}>
      <motion.span
        className="inline"
        initial="hidden"
        whileInView="visible"
        viewport={{ once, margin: "-50px" }}
        variants={containerVariants}
        aria-label={text}
      >
        {units.map((unit, i) => (
          <span key={i} className="inline-block overflow-hidden">
            <motion.span className="inline-block" variants={unitVariants}>
              {unit}
              {splitBy !== "character" && i < units.length - 1 ? "\u00A0" : ""}
            </motion.span>
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}
