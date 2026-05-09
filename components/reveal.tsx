"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const variants: Variants = {
  hidden: { opacity: 0, y: 24 },
  shown: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 110, damping: 22 },
  },
};

const containerVariants: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.08 } },
};

export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "header";
}) {
  const Component = motion[as] as typeof motion.div;
  return (
    <Component
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.25 }}
      variants={variants}
      transition={{ delay }}
      className={className}
    >
      {children}
    </Component>
  );
}

export function RevealStack({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "ol" | "ul";
}) {
  const Component = motion[as] as typeof motion.div;
  return (
    <Component
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.2 }}
      variants={containerVariants}
      className={className}
    >
      {children}
    </Component>
  );
}

export const revealItem: Variants = variants;
